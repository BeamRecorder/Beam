import { onUnmounted, reactive, ref, watch, type Ref } from 'vue';
import ThumbnailWorker from '~/media/playback/thumbnail.worker?worker';
import type { ThumbnailWorkerResponse } from '~/media/playback/thumbnail-protocol';
import { mediaSourceDescriptor, type MediaAsset } from '~/media/shared';
import { useMediaProcessingReporter } from '../../performance/media-processing-pressure';

const CACHE_LIMIT = 96;
const THUMBNAIL_WORKER_COUNT = 2;

export function useThumbnails(videoAssetRef: Ref<MediaAsset | null>) {
  const pressure = useMediaProcessingReporter('thumbnails', THUMBNAIL_WORKER_COUNT);
  const thumbnails = reactive<Record<number, string>>({});
  const isExtracting = ref(false);
  const error = ref<string | null>(null);
  const cacheOrder: number[] = [];
  const retainedTimes = new Set<number>();
  const workers: Worker[] = [];
  const activeWorkers = new Set<number>();
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
      const [expired] = cacheOrder.splice(expiredIndex, 1);
      if (expired === undefined) continue;
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
    if (message.generation !== generation) return;
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
      if (activeWorkers.size === 0) remainingFrames = 0;
      updatePressure();
      return;
    }
    remainingFrames = Math.max(0, remainingFrames - 1);
    queueThumbnail(message.time, message.blob);
    updatePressure();
  };

  const initWorkers = () => {
    if (workers.length > 0) return;
    for (let index = 0; index < THUMBNAIL_WORKER_COUNT; index += 1) {
      const worker = new ThumbnailWorker();
      worker.onmessage = (event: MessageEvent<ThumbnailWorkerResponse>) => receiveWorkerMessage(event.data, index);
      worker.onerror = () => {
        console.error('[Beam media:thumbnails] Thumbnail worker crashed.');
        for (const activeWorker of workers) activeWorker.terminate();
        workers.length = 0;
        activeWorkers.clear();
        isExtracting.value = false;
        error.value = 'Timeline thumbnail decoding failed.';
        remainingFrames = 0;
        pressure.error();
        updatePressure();
      };
      workers.push(worker);
    }
  };

  const requestVisibleFrames = (visibleTimes: number[]) => {
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
    const asset = videoAssetRef.value;
    if (!asset || visibleTimes.length === 0) return;
    const missingTimes = visibleTimes.filter((time) => !thumbnails[time]);
    if (missingTimes.length === 0) return;
    initWorkers();
    const requestGeneration = ++generation;
    remainingFrames = missingTimes.length;
    activeWorkers.clear();
    isExtracting.value = true;
    error.value = null;
    try {
      const workerCount = Math.min(workers.length, missingTimes.length);
      const chunkSize = Math.ceil(missingTimes.length / workerCount);
      for (let index = 0; index < workerCount; index += 1) {
        const visibleTimes = missingTimes.slice(index * chunkSize, (index + 1) * chunkSize);
        if (visibleTimes.length === 0) continue;
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
      if (requestGeneration === generation) {
        activeWorkers.clear();
        isExtracting.value = false;
        error.value = 'Timeline thumbnail decoding failed.';
        remainingFrames = 0;
        pressure.error();
        updatePressure();
      }
    }
  };

  watch(() => {
    const asset = videoAssetRef.value;
    return asset ? `${asset.id}\u0000${asset.src}` : null;
  }, clearCache);

  onUnmounted(() => {
    clearCache();
    for (const worker of workers) worker.terminate();
    workers.length = 0;
    pressure.dispose();
  });

  return { thumbnails, isExtracting, error, requestVisibleFrames, clearCache };
}
