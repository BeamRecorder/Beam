const fs = require('node:fs');
const { homedir } = require('node:os');
const { join } = require('node:path');
const { startProcess } = require('./ffmpeg-process.cjs');
const { createFramePump, sendGpuFrame } = require('./gpu-frame-transport.cjs');
const { validateExperimentalRequest, readNativeResult } = require('./experimental-export-validation.cjs');

function createExperimentalGpuExport({
  ipcMain,
  app,
  BrowserWindow,
  applicationRoot,
  developmentUrl = 'http://localhost:6500',
}) {
  const sessions = new Map();
  const requireSession = (event) => {
    const session = sessions.get(event.sender.id);
    if (!session || event.senderFrame !== event.sender.mainFrame)
      throw new Error('Unauthorized experimental export renderer.');
    return session;
  };
  ipcMain.handle('ffmpeg-gpu:request', (event) => {
    const session = requireSession(event);
    clearTimeout(session.startupTimer);
    return session.request;
  });
  ipcMain.handle('ffmpeg-gpu:prepare-frame', (event, sequence) => {
    const session = requireSession(event);
    if (sequence !== session.nextFrame || sequence >= session.geometry.frames)
      throw new Error('Invalid experimental export frame order.');
    session.pump.arm(sequence);
    event.sender.stopPainting();
  });
  ipcMain.handle('ffmpeg-gpu:frame', async (event, sequence) => {
    const session = requireSession(event);
    if (sequence !== session.nextFrame || sequence >= session.geometry.frames)
      throw new Error('Invalid experimental export frame order.');
    session.nextFrame += 1;
    const captured = session.pump.capture(sequence);
    event.sender.startPainting();
    await captured;
  });
  ipcMain.handle('ffmpeg-gpu:audio', async (event, { data, firstFrame } = {}) => {
    const session = requireSession(event);
    if (
      !(data instanceof Uint8Array) ||
      !data.byteLength ||
      data.byteLength > 1024 * 1024 ||
      data.byteLength % 8 ||
      firstFrame !== session.audioFrames ||
      session.audioFrames + data.byteLength / 8 > Math.ceil(session.request.snapshot.duration * 48_000)
    )
      throw new Error('Invalid experimental export audio block.');
    session.audioFrames += data.byteLength / 8;
    session.audioQueue = session.audioQueue.then(async () => {
      session.audioFile ??= await fs.promises.open(session.audioPath, 'wx');
      const bytes = Buffer.from(data.buffer, data.byteOffset, data.byteLength);
      let offset = 0;
      while (offset < bytes.length) {
        const { bytesWritten } = await session.audioFile.write(bytes, offset, bytes.length - offset);
        if (!bytesWritten) throw new Error('Incomplete experimental audio write.');
        offset += bytesWritten;
      }
    });
    await session.audioQueue;
  });
  ipcMain.handle('ffmpeg-gpu:progress', (event, progress) => {
    const session = requireSession(event);
    if (
      !progress ||
      !['validating_assets', 'loading_assets', 'encoding', 'finalizing'].includes(progress.stage) ||
      !Number.isSafeInteger(progress.completedImages) ||
      progress.completedImages < 0 ||
      progress.completedImages > session.geometry.frames
    )
      throw new Error('Invalid experimental export progress.');
    session.owner.send('export:ffmpeg-progress', { jobId: session.job.id, progress });
  });
  ipcMain.handle('ffmpeg-gpu:complete', (event, diagnostics) => {
    const session = requireSession(event);
    if (session.nextFrame !== session.geometry.frames) throw new Error('Experimental export is incomplete.');
    session.resolve(diagnostics);
  });
  ipcMain.handle('ffmpeg-gpu:error', (event, message) =>
    requireSession(event).reject(new Error(String(message).slice(0, 16_384))),
  );

  async function run(owner, job, request) {
    if (process.platform !== 'linux') throw new Error('Experimental FFmpeg GPU export is Linux-only.');
    const geometry = validateExperimentalRequest(request);
    const checkCancelled = () => {
      if (job.cancelled) throw new Error('Experimental GPU export cancelled.');
    };
    checkCancelled();
    const root = app.isPackaged
      ? join(process.resourcesPath, 'ffmpeg-export')
      : join(applicationRoot, 'build/native/ffmpeg-export');
    const executable = join(root, 'beam-ffmpeg-export');
    const transport = join(root, 'beam-gpu-transport.node');
    if (!fs.existsSync(executable) || !fs.existsSync(transport))
      throw new Error('The experimental GPU backend is not built. Run bun run build:ffmpeg-export.');
    const bridge = require(transport);
    const cache = join(homedir(), '.cache');
    await fs.promises.mkdir(cache, { recursive: true });
    const directory = await fs.promises.mkdtemp(join(cache, 'beam-gpu-'));
    const socket = join(directory, 'gpu');
    const processes = new Set();
    let window;
    let session;
    let closed = false;
    const cancel = () => {
      if (closed) return;
      job.cancelled = true;
      for (const process of processes) process.cancel();
      session?.reject(new Error('Experimental GPU export cancelled.'));
    };
    job.cancel = cancel;
    try {
      await fs.promises.chmod(directory, 0o700);
      checkCancelled();
      // Native GPU import is isolated from Chromium's bundled FFmpeg libraries.
      const native = startProcess(
        executable,
        [
          socket,
          job.temporaryPath,
          geometry.width,
          geometry.height,
          geometry.fps,
          request.nativeBitrate,
          request.format,
          geometry.frames,
          Math.round(request.snapshot.duration * 1_000_000),
          process.env.BEAM_FFMPEG_DRM_DEVICE || '/dev/dri/renderD128',
        ].map(String),
        { timeoutMs: 24 * 60 * 60 * 1000 },
      );
      processes.add(native);
      await Promise.race([
        native.ready,
        new Promise((_, reject) => {
          const timer = setTimeout(() => reject(new Error('FFmpeg GPU export startup timed out.')), 10_000);
          timer.unref();
          native.ready.finally(() => clearTimeout(timer)).catch(() => undefined);
        }),
      ]);
      checkCancelled();
      window = new BrowserWindow({
        width: geometry.width,
        height: geometry.height,
        useContentSize: true,
        frame: false,
        show: false,
        transparent: false,
        webPreferences: {
          offscreen: { useSharedTexture: true, deviceScaleFactor: 1 },
          preload: join(__dirname, 'experimental-gpu-preload.cjs'),
          sandbox: true,
          contextIsolation: true,
          nodeIntegration: false,
          backgroundThrottling: false,
          zoomFactor: 1,
        },
      });
      // Linux constrains initial window bounds to the display work area. Resize
      // the hidden surface explicitly so export resolution is independent of it.
      window.setContentSize(geometry.width, geometry.height, false);
      window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
      window.webContents.on('will-navigate', (event) => event.preventDefault());
      let mainNavigations = 0;
      window.webContents.on('did-start-navigation', (event) => {
        if (event.isMainFrame && !event.isSameDocument && ++mainNavigations > 1)
          session?.reject(
            new Error('The GPU export renderer reloaded during export. Restart the export after development changes.'),
          );
      });
      // Shared-texture OSR accepts rates above the bitmap limit of 240. This
      // accelerates presentation scheduling, not the output video's frame rate.
      window.webContents.setFrameRate(1000);
      const complete = new Promise((resolve, reject) => {
        session = {
          owner,
          job,
          request,
          geometry,
          resolve,
          reject,
          contentsId: window.webContents.id,
          nextFrame: 0,
          audioFrames: 0,
          audioPath: join(directory, 'audio.f32'),
          audioFile: null,
          audioQueue: Promise.resolve(),
          startupTimer: setTimeout(() => reject(new Error('GPU export renderer startup timed out.')), 30_000),
          pump: createFramePump(window.webContents, (info, sequence) =>
            sendGpuFrame(bridge, socket, info, sequence, geometry.width, geometry.height),
          ),
        };
      });
      void complete.catch(() => undefined);
      sessions.set(window.webContents.id, session);
      native.completion.catch(session.reject);
      window.webContents.once('render-process-gone', (_event, details) =>
        session.reject(new Error(`GPU export renderer lost: ${details.reason}`)),
      );
      window.webContents.once('unresponsive', () => session.reject(new Error('GPU export renderer is unresponsive.')));
      window.once('closed', () => {
        if (!closed) session.reject(new Error('GPU export window closed unexpectedly.'));
      });
      const loading = app.isPackaged
        ? window.loadFile(join(applicationRoot, 'dist/html/export-gpu.html'))
        : window.loadURL(`${developmentUrl}/html/export-gpu.html`);
      loading.catch(session.reject);
      checkCancelled();
      const diagnostics = await complete;
      const output = await native.completion;
      processes.delete(native);
      const encoded = readNativeResult(output.stdout, geometry.frames);
      await session.audioQueue;
      await session.audioFile?.close();
      session.audioFile = null;
      let audioEncoder = null;
      if (session.audioFrames) {
        if (session.audioFrames !== Math.ceil(request.snapshot.duration * 48_000))
          throw new Error('Experimental audio mix is incomplete.');
        const muxed = join(directory, `muxed.${request.format}`);
        audioEncoder = request.format === 'mp4' ? 'aac' : 'libopus';
        const mux = startProcess(
          'ffmpeg',
          [
            '-hide_banner',
            '-loglevel',
            'error',
            '-nostdin',
            '-i',
            job.temporaryPath,
            '-f',
            'f32le',
            '-ar',
            '48000',
            '-ac',
            '2',
            '-i',
            session.audioPath,
            '-map',
            '0:v:0',
            '-map',
            '1:a:0',
            '-c:v',
            'copy',
            '-c:a',
            audioEncoder,
            '-b:a',
            '128k',
            '-t',
            String(request.snapshot.duration),
            muxed,
          ],
          { timeoutMs: 30 * 60 * 1000 },
        );
        processes.add(mux);
        await mux.completion;
        processes.delete(mux);
        // The staging file and cache can be on different filesystems.
        await fs.promises.copyFile(muxed, job.temporaryPath);
      }
      const { size } = await fs.promises.stat(job.temporaryPath);
      return {
        ...diagnostics,
        bytesWritten: size,
        encodedPacketCount: encoded.packets,
        encodedVideoBytes: encoded.bytes,
        keyFrameCount: encoded.keyframes,
        nativeConversionMs: encoded.conversionMs,
        nativeEncodingMs: encoded.encodingMs,
        videoEncoderImplementation: 'ffmpeg-vaapi',
        frameTransfer: 'dma-buf-direct',
        videoCodec: request.format === 'mp4' ? 'avc' : 'vp9',
        encoderCodec: request.format === 'mp4' ? 'h264_vaapi' : 'vp9_vaapi',
        encoderBitrate: request.nativeBitrate,
        encoderBitrateMode: 'variable',
        hardwareEncoderCheck: 'passed',
        audioCodec: audioEncoder ? (request.format === 'mp4' ? 'aac' : 'opus') : null,
        ...(audioEncoder ? { audioEncoderImplementation: 'ffmpeg' } : {}),
      };
    } finally {
      closed = true;
      cancel();
      for (const process of processes) process.cancel();
      if (session) {
        clearTimeout(session.startupTimer);
        sessions.delete(session.contentsId);
        await session.pump.dispose();
        await session.audioQueue.catch(() => undefined);
        await session.audioFile?.close().catch(() => undefined);
      }
      if (window && !window.isDestroyed()) {
        window.destroy();
      }
      await Promise.allSettled([...processes].map((process) => process.completion));
      await fs.promises.rm(directory, { recursive: true, force: true });
      job.cancel = null;
    }
  }
  return { run };
}
module.exports = { createExperimentalGpuExport };
