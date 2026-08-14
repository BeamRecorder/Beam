import { onUnmounted, reactive, ref, watch, type Ref } from 'vue';
import ThumbnailWorker from '~/media/playback/thumbnail.worker?worker';
import type { ThumbnailWorkerResponse } from '~/media/playback/thumbnail-protocol';
import { mediaSourceDescriptor, type MediaAsset } from '~/media/shared';

const CACHE_LIMIT = 96;

export function useThumbnails(videoAssetRef: Ref<MediaAsset | null>) {
  const thumbnails = reactive<Record<number, string>>({});
  const isExtracting = ref(false);
  const error = ref<string | null>(null);
  const cacheOrder: number[] = [];
  const retainedTimes = new Set<number>();
  let worker: Worker | null = null;
  let generation = 0;
  let requestQueued = false;
  let queuedTimes: number[] = [];

  const clearCache = () => {
    generation += 1;
    worker?.postMessage({ type: 'clear', generation });
    for (const [time, url] of Object.entries(thumbnails)) {
      URL.revokeObjectURL(url);
      delete thumbnails[Number(time)];
    }
    cacheOrder.length = 0;
    retainedTimes.clear();
    queuedTimes = [];
    requestQueued = false;
    isExtracting.value = false;
    error.value = null;
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

  const receiveWorkerMessage = (message: ThumbnailWorkerResponse) => {
    if (message.generation !== generation) return;
    if (message.type === 'batch-started') {
      isExtracting.value = true;
      error.value = null;
      return;
    }
    if (message.type === 'batch-finished' || message.type === 'error') {
      isExtracting.value = false;
      if (message.type === 'error') error.value = message.message;
      return;
    }
    cacheThumbnail(message.time, message.blob);
  };

  const initWorker = () => {
    if (worker) return;
    worker = new ThumbnailWorker();
    worker.onmessage = (event: MessageEvent<ThumbnailWorkerResponse>) => {
      receiveWorkerMessage(event.data);
    };
    worker.onerror = () => {
      console.error('[Beam media:thumbnails] Thumbnail worker crashed.');
      isExtracting.value = false;
      error.value = 'Timeline thumbnail decoding failed.';
    };
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
    if (requestQueued) return;
    requestQueued = true;
    queueMicrotask(() => {
      requestQueued = false;
      const times = queuedTimes;
      queuedTimes = [];
      void requestMissingFrames(times);
    });
  };

  const requestMissingFrames = (visibleTimes: number[]) => {
    const asset = videoAssetRef.value;
    if (!asset || visibleTimes.length === 0) return;
    const missingTimes = visibleTimes.filter((time) => !thumbnails[time]);
    if (missingTimes.length === 0) return;
    initWorker();
    const requestGeneration = generation;
    isExtracting.value = true;
    error.value = null;
    try {
      worker?.postMessage({
        type: 'request-frames',
        generation: requestGeneration,
        source: mediaSourceDescriptor(asset),
        visibleTimes: missingTimes,
      });
    } catch (postError) {
      console.error('[Beam media:thumbnails] Thumbnail request failed.', postError);
      if (requestGeneration === generation) {
        isExtracting.value = false;
        error.value = 'Timeline thumbnail decoding failed.';
      }
    }
  };

  watch(() => {
    const asset = videoAssetRef.value;
    return asset ? `${asset.id}\u0000${asset.src}` : null;
  }, clearCache);

  onUnmounted(() => {
    clearCache();
    worker?.terminate();
  });

  return { thumbnails, isExtracting, error, requestVisibleFrames, clearCache };
}
