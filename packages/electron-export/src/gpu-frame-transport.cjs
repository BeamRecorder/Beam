const { createGpuFrameQueue } = require('./gpu-frame-queue.cjs');

function frameArguments(info, sequence, width, height, socket) {
  if (!info || !['rgba', 'bgra'].includes(info.pixelFormat)) throw new Error('Unsupported GPU export texture format.');
  if (info.codedSize?.width !== width || info.codedSize?.height !== height)
    throw new Error(
      `GPU export texture is ${info.codedSize?.width ?? '?'}×${info.codedSize?.height ?? '?'}; expected ${width}×${height}.`,
    );
  const pixmap = info.handle?.nativePixmap;
  if (
    pixmap?.planes?.length !== 1 ||
    !/^(0|[1-9]\d*)$/.test(pixmap.modifier ?? '') ||
    BigInt(pixmap.modifier) > 0xffffffffffffffffn
  )
    throw new Error('A single-plane Linux DMA-BUF texture is required.');
  const plane = pixmap.planes[0];
  for (const key of ['fd', 'stride', 'offset', 'size']) {
    if (!Number.isSafeInteger(plane[key]) || plane[key] < 0 || plane[key] > 0xffffffff)
      throw new Error(`Invalid DMA-BUF ${key}.`);
  }
  const required = plane.offset + (height - 1) * plane.stride + width * 4;
  if (plane.fd < 3 || plane.stride < width * 4 || plane.size < required || plane.size > 1024 ** 3)
    throw new Error('Invalid DMA-BUF bounds.');
  if (!Number.isSafeInteger(sequence) || sequence < 0 || sequence > 0xffffffff)
    throw new Error('Invalid GPU frame sequence.');
  return {
    fd: plane.fd,
    args: [
      socket,
      sequence,
      width,
      height,
      plane.stride,
      plane.offset,
      plane.size,
      pixmap.modifier,
      info.pixelFormat,
    ].map(String),
  };
}

function createFramePump(webContents, submit, timeoutMs = 15_000, now = () => performance.now(), queueDepth = 3) {
  let pending = null;
  let disposed = false;
  let armed = null;
  let captureWaitMs = 0;
  const queue = createGpuFrameQueue(submit, queueDepth, now);
  const deliver = (texture, frame) => {
    pending = null;
    armed = null;
    captureWaitMs += now() - frame.startedAt;
    webContents.stopPainting?.();
    try {
      queue.enqueue(texture, frame.sequence);
      frame.resolve();
    } catch (error) {
      texture.release();
      frame.reject(error);
    }
  };
  const paint = (event) => {
    const texture = event.texture;
    if (!texture) return;
    if (!pending || disposed) {
      texture.release();
      return;
    }
    deliver(texture, pending);
  };
  webContents.on('paint', paint);
  return {
    get timings() {
      return { captureWaitMs, ...queue.timings };
    },
    async prepare(sequence) {
      await queue.ready();
      this.arm(sequence);
    },
    arm(sequence) {
      if (disposed || pending || armed !== null)
        throw new Error('GPU frame preparation is unavailable or already pending.');
      armed = sequence;
    },
    drain: () => queue.drain(),
    capture(sequence) {
      if (disposed || pending || armed !== sequence)
        return Promise.reject(new Error('GPU frame capture is unavailable or already pending.'));
      return new Promise((resolve, reject) => {
        const timer = setTimeout(() => {
          if (pending?.sequence === sequence) pending = null;
          armed = null;
          reject(new Error('Timed out waiting for the export GPU texture.'));
        }, timeoutMs);
        const finish = (callback) => (value) => {
          clearTimeout(timer);
          callback(value);
        };
        pending = { sequence, startedAt: now(), resolve: finish(resolve), reject: finish(reject) };
      });
    },
    async dispose() {
      disposed = true;
      pending?.reject(new Error('GPU export cancelled.'));
      pending = null;
      armed = null;
      webContents.removeListener('paint', paint);
      await queue.dispose();
    },
  };
}

async function sendGpuFrame(bridge, socket, info, sequence, width, height) {
  const { fd, args } = frameArguments(info, sequence, width, height, socket);
  await bridge.transfer(fd, args);
}

module.exports = { frameArguments, createFramePump, sendGpuFrame };
