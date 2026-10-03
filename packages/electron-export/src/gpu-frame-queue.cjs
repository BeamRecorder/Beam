/** Retain a bounded number of captured GPU textures; submit strictly in order. */
function createGpuFrameQueue(submit, capacity, now = () => performance.now()) {
  if (!Number.isSafeInteger(capacity) || capacity < 1 || capacity > 4)
    throw new Error('Invalid GPU frame queue capacity.');
  const waiting = new Set();
  const frames = [];
  let owned = 0,
    peak = 0,
    running = null,
    failure = null,
    disposed = false,
    transferWaitMs = 0;
  const changed = () => {
    for (const notify of [...waiting]) notify();
  };
  const fail = (error) => {
    failure ??= error instanceof Error ? error : new Error(String(error));
  };
  const release = (texture) => {
    try {
      texture.release();
    } catch (error) {
      fail(error);
    } finally {
      owned--;
    }
  };
  const check = () => {
    if (failure) throw failure;
    if (disposed) throw new Error('GPU export cancelled.');
  };
  const waitUntil = (condition) =>
    new Promise((resolve, reject) => {
      const notify = () => {
        try {
          check();
          if (!condition()) return;
          waiting.delete(notify);
          resolve();
        } catch (error) {
          waiting.delete(notify);
          reject(error);
        }
      };
      waiting.add(notify);
      notify();
    });
  const run = async () => {
    while (frames.length && !disposed && !failure) {
      const frame = frames.shift();
      const started = now();
      try {
        await submit(frame.texture.textureInfo, frame.sequence);
      } catch (error) {
        fail(error);
      } finally {
        transferWaitMs += now() - started;
        release(frame.texture);
        changed();
      }
    }
    if (failure) {
      for (const frame of frames.splice(0)) {
        release(frame.texture);
      }
      changed();
    }
  };
  const start = () => {
    running = run().finally(() => {
      running = null;
      if (frames.length && !disposed && !failure) start();
    });
    void running.catch(() => undefined);
  };
  return {
    get timings() {
      return { transferWaitMs, peakFrames: peak, capacity };
    },
    ready: () => waitUntil(() => owned < capacity),
    enqueue(texture, sequence) {
      check();
      if (owned >= capacity) throw new Error('GPU frame queue is full.');
      frames.push({ texture, sequence });
      owned++;
      peak = Math.max(peak, owned);
      if (!running) start();
    },
    drain: () => waitUntil(() => owned === 0),
    async dispose() {
      disposed = true;
      for (const frame of frames.splice(0)) {
        release(frame.texture);
      }
      changed();
      await running;
    },
  };
}
module.exports = { createGpuFrameQueue };
