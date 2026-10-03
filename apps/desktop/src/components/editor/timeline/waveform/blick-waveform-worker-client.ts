import type {
  BlickWaveformWorkerRenderer,
  BlickWaveformWorkerReply,
  BlickWaveformWorkerRequest,
} from './blick-waveform-types';

let shared: ReturnType<typeof createWorker> | undefined;
let users = 0;
let nextId = 0;

function createWorker() {
  const worker = new Worker(new URL('./blick-waveform.worker.ts', import.meta.url), { type: 'module' });
  const requests = new Map<number, { resolve: (bitmap: ImageBitmap) => void; reject: (error: Error) => void }>();
  let failure: Error | undefined;
  const fail = (error: Error) => {
    failure = error;
    for (const request of requests.values()) request.reject(error);
    requests.clear();
  };
  worker.onmessage = ({ data }: MessageEvent<BlickWaveformWorkerReply>) => {
    const request = requests.get(data.id);
    if (!request) {
      if ('bitmap' in data) data.bitmap.close();
      return;
    }
    requests.delete(data.id);
    if ('error' in data) request.reject(new Error(data.error));
    else request.resolve(data.bitmap);
  };
  worker.onerror = (event) => fail(new Error(event.message || 'The audio waveform worker stopped.'));
  worker.onmessageerror = () => fail(new Error('The audio waveform response could not be read.'));
  return {
    request: (request: BlickWaveformWorkerRequest) =>
      new Promise<ImageBitmap>((resolve, reject) => {
        if (failure) return reject(failure);
        requests.set(request.id, { resolve, reject });
        try {
          worker.postMessage(request, [request.data.bands.buffer]);
        } catch (cause) {
          requests.delete(request.id);
          reject(cause);
        }
      }),
    dispose: () => {
      fail(new Error('The audio waveform renderer was disposed.'));
      worker.terminate();
    },
  };
}

export function acquireBlickWaveformWorker(): BlickWaveformWorkerRenderer {
  shared ??= createWorker();
  const owned = shared;
  users += 1;
  let released = false;
  let generation = 0;
  return {
    async draw(target, data, width, height) {
      if (released) return false;
      const requestGeneration = ++generation;
      const bitmap = await owned.request({
        id: ++nextId,
        width,
        height,
        pixelRatio: window.devicePixelRatio,
        data: {
          bars: Array.from(data.bars),
          bands: new Float32Array(data.bands),
          sourceDurationSeconds: data.sourceDurationSeconds,
          loadingSegments: data.loadingSegments.map(({ leftPercent, widthPercent }) => ({
            leftPercent,
            widthPercent,
          })),
        },
      });
      try {
        if (released || requestGeneration !== generation) return false;
        const context = target.getContext('2d');
        if (!context) throw new Error('The audio waveform canvas is unavailable.');
        if (target.width !== bitmap.width) target.width = bitmap.width;
        if (target.height !== bitmap.height) target.height = bitmap.height;
        context.clearRect(0, 0, target.width, target.height);
        context.drawImage(bitmap, 0, 0);
        return true;
      } finally {
        bitmap.close();
      }
    },
    dispose() {
      if (released) return;
      released = true;
      if (--users === 0) {
        owned.dispose();
        shared = undefined;
      }
    },
  };
}
