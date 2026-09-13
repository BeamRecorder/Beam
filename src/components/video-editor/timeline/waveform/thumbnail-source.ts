import { reactive, ref } from 'vue';
import ThumbnailWorker from '~/media/playback/thumbnail.worker?worker';
import type { ThumbnailWorkerResponse } from '~/media/playback/thumbnail-protocol';
import { mediaSourceDescriptor, type MediaAsset } from '~/media/shared';
import type { MediaProcessingReporter } from '../../performance/media-processing-pressure';

const CACHE_LIMIT = 96;
export const THUMBNAIL_WORKER_COUNT = 2;

export function createThumbnailSource(asset: MediaAsset, pressure: MediaProcessingReporter) {
  let disposed = false;
  const thumbnails = reactive<Record<number, string>>({});
  const isExtracting = ref(false);
  const error = ref<string | null>(null);
  const cacheOrder: number[] = [];
  const retainedTimes = new Set<number>();
  const workers: Worker[] = [];
  const activeWorkers = new Set<number>();
  const inFlightTimes = new Set<number>();
  const pendingFrames = new Map<number, Blob>();
  let generation = 0;
  let thumbnailFrame = 0;
  let requestQueued = false;
  let queuedTimes: number[] = [];
  let remainingFrames = 0;

  const updatePressure = () =>
    pressure.update(activeWorkers.size, remainingFrames + queuedTimes.length + pendingFrames.size);

  const clearCache = () => {
    generation += 1;
    for (const worker of workers) worker.postMessage({ type: 'clear', generation });
    for (const [time, url] of Object.entries(thumbnails)) {
      URL.revokeObjectURL(url);
      delete thumbnails[Number(time)];
    }
    cacheOrder.length = 0;
    retainedTimes.clear();
    queuedTimes = [];
    requestQueued = false;
    isExtracting.value = false;
    activeWorkers.clear();
    inFlightTimes.clear();
    pendingFrames.clear();
    remainingFrames = 0;
    cancelAnimationFrame(thumbnailFrame);
    thumbnailFrame = 0;
    error.value = null;
    updatePressure();
  };

  const touchThumbnail = (time: number) => {
    const index = cacheOrder.indexOf(time);
    if (index >= 0) cacheOrder.splice(index, 1);
    cacheOrder.push(time);
  };

  const pruneCache = () => {
    while (cacheOrder.length > CACHE_LIMIT) {
      const expiredIndex = cacheOrder.findIndex((time) => !retainedTimes.has(time));
      if (expiredIndex < 0) break;
      const expired = cacheOrder.splice(expiredIndex, 1)[0]!;
      URL.revokeObjectURL(thumbnails[expired]);
      delete thumbnails[expired];
    }
  };

  const cacheThumbnail = (time: number, blob: Blob) => {
    const existing = thumbnails[time];
    if (existing) URL.revokeObjectURL(existing);
    thumbnails[time] = URL.createObjectURL(blob);
    touchThumbnail(time);
    pruneCache();
  };

  const queueThumbnail = (time: number, blob: Blob) => {
    pendingFrames.set(time, blob);
    if (thumbnailFrame) return;
    thumbnailFrame = requestAnimationFrame(() => {
      thumbnailFrame = 0;
      for (const [pendingTime, pendingBlob] of pendingFrames) cacheThumbnail(pendingTime, pendingBlob);
      pendingFrames.clear();
      updatePressure();
    });
  };

  const receiveWorkerMessage = (message: ThumbnailWorkerResponse, workerIndex: number) => {
    if (disposed || message.generation !== generation) return;
    if (message.type === 'batch-started') {
      activeWorkers.add(workerIndex);
      isExtracting.value = true;
      error.value = null;
      updatePressure();
      return;
    }
    if (message.type === 'batch-finished' || message.type === 'error') {
      activeWorkers.delete(workerIndex);
      isExtracting.value = activeWorkers.size > 0;
      if (message.type === 'error') error.value = message.message;
      if (message.type === 'error') pressure.error();
      if (message.type === 'error' || activeWorkers.size === 0) inFlightTimes.clear();
      if (activeWorkers.size === 0) remainingFrames = 0;
      updatePressure();
      return;
    }
    remainingFrames = Math.max(0, remainingFrames - 1);
    inFlightTimes.delete(message.time);
    queueThumbnail(message.time, message.blob);
    updatePressure();
  };

  const stopWorkers = () => {
    generation += 1;
    for (const worker of workers) worker.terminate();
    workers.length = 0;
    activeWorkers.clear();
    inFlightTimes.clear();
    isExtracting.value = false;
    remainingFrames = 0;
    updatePressure();
  };

  const initWorkers = () => {
    if (workers.length > 0) return;
    for (let index = 0; index < THUMBNAIL_WORKER_COUNT; index += 1) {
      const worker = new ThumbnailWorker();
      worker.onmessage = (event: MessageEvent<ThumbnailWorkerResponse>) => receiveWorkerMessage(event.data, index);
      worker.onerror = () => {
        if (disposed || !workers.includes(worker)) return;
        console.error('[Beam media:thumbnails] Thumbnail worker crashed.');
        stopWorkers();
        error.value = 'Timeline thumbnail decoding failed.';
        pressure.error();
        updatePressure();
      };
      workers.push(worker);
    }
  };

  const requestVisibleFrames = (visibleTimes: number[]) => {
    if (disposed) return;
    queuedTimes = [...new Set(visibleTimes.filter((time) => Number.isFinite(time) && time >= 0))].sort(
      (left, right) => left - right,
    );
    retainedTimes.clear();
    queuedTimes.forEach((time) => {
      retainedTimes.add(time);
      if (thumbnails[time]) touchThumbnail(time);
    });
    pruneCache();
    updatePressure();
    if (requestQueued) return;
    requestQueued = true;
    queueMicrotask(() => {
      requestQueued = false;
      const times = queuedTimes;
      queuedTimes = [];
      updatePressure();
      void requestMissingFrames(times);
    });
  };

  const requestMissingFrames = (visibleTimes: number[]) => {
    if (disposed) return;
    if (visibleTimes.length === 0) {
      stopWorkers();
      return;
    }
    const missingTimes = visibleTimes.filter((time) => !thumbnails[time] && !pendingFrames.has(time));
    if (missingTimes.length === 0) return;
    if (activeWorkers.size > 0 && missingTimes.every((time) => inFlightTimes.has(time))) return;
    initWorkers();
    const requestGeneration = ++generation;
    remainingFrames = missingTimes.length;
    activeWorkers.clear();
    inFlightTimes.clear();
    for (const time of missingTimes) inFlightTimes.add(time);
    isExtracting.value = true;
    error.value = null;
    try {
      const workerCount = Math.min(workers.length, missingTimes.length);
      const chunkSize = Math.ceil(missingTimes.length / workerCount);
      for (let index = 0; index < workerCount; index += 1) {
        const visibleTimes = missingTimes.slice(index * chunkSize, (index + 1) * chunkSize);
        activeWorkers.add(index);
        workers[index]!.postMessage({
          type: 'request-frames',
          generation: requestGeneration,
          source: mediaSourceDescriptor(asset),
          visibleTimes,
        });
      }
      updatePressure();
    } catch (postError) {
      console.error('[Beam media:thumbnails] Thumbnail request failed.', postError);
      activeWorkers.clear();
      inFlightTimes.clear();
      isExtracting.value = false;
      error.value = 'Timeline thumbnail decoding failed.';
      remainingFrames = 0;
      pressure.error();
      updatePressure();
    }
  };

  const dispose = () => {
    if (disposed) return;
    disposed = true;
    clearCache();
    stopWorkers();
    pressure.dispose();
  };

  return { thumbnails, isExtracting, error, requestVisibleFrames, clearCache, dispose };
}
