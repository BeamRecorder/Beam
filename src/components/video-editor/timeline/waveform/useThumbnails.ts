import { computed, inject, onUnmounted, shallowRef, watch, type Ref } from 'vue';
import type { MediaAsset } from '~/media/shared';
import {
  createMediaProcessingCollector,
  MEDIA_PROCESSING_COLLECTOR,
  type MediaProcessingCollector,
} from '../../performance/media-processing-pressure';
import { createThumbnailSource, THUMBNAIL_WORKER_COUNT } from './thumbnail-source';
import type { SharedThumbnailSource } from './thumbnail-source-types';

const defaultCollector = createMediaProcessingCollector();
const pools = new WeakMap<MediaProcessingCollector, Map<string, SharedThumbnailSource>>();
const emptyThumbnails: Record<number, string> = Object.freeze({});

function requestSharedFrames(entry: SharedThumbnailSource) {
  if (entry.queued) return;
  entry.queued = true;
  queueMicrotask(() => {
    entry.queued = false;
    if (entry.requests.size) entry.source.requestVisibleFrames([...entry.requests.values()].flat());
  });
}

export function useThumbnails(videoAssetRef: Ref<MediaAsset | null>) {
  const collector = inject(MEDIA_PROCESSING_COLLECTOR, defaultCollector);
  let pool = pools.get(collector);
  if (!pool) pools.set(collector, (pool = new Map()));
  const sources = pool;
  const owner = Symbol('thumbnail-viewport');
  const current = shallowRef<SharedThumbnailSource | null>(null);
  let currentKey: string | null = null;

  const release = () => {
    const entry = current.value;
    if (!entry) return;
    entry.requests.delete(owner);
    if (entry.requests.size) requestSharedFrames(entry);
    else {
      entry.source.dispose();
      sources.delete(currentKey!);
    }
    current.value = null;
    currentKey = null;
  };

  watch(
    () => {
      const asset = videoAssetRef.value;
      return asset ? `${asset.id}\u0000${asset.src}` : null;
    },
    (key) => {
      release();
      if (key === null) return;
      let entry = sources.get(key);
      if (!entry) {
        entry = {
          source: createThumbnailSource(videoAssetRef.value!, collector.reporter('thumbnails', THUMBNAIL_WORKER_COUNT)),
          requests: new Map(),
          queued: false,
        };
        sources.set(key, entry);
      }
      entry.requests.set(owner, []);
      current.value = entry;
      currentKey = key;
    },
    { immediate: true, flush: 'sync' },
  );
  onUnmounted(release);

  return {
    thumbnails: computed(() => current.value?.source.thumbnails ?? emptyThumbnails),
    isExtracting: computed(() => current.value?.source.isExtracting.value ?? false),
    error: computed(() => current.value?.source.error.value ?? null),
    requestVisibleFrames(times: number[]) {
      const entry = current.value;
      if (!entry) return;
      entry.requests.set(owner, [...times]);
      requestSharedFrames(entry);
    },
    clearCache() {
      current.value?.source.clearCache();
    },
  };
}
