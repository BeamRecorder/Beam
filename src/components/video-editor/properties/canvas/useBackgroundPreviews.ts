import { onUnmounted, reactive } from 'vue';
import BackgroundPreviewWorker from './background-preview.worker?worker&inline';
import type { BackgroundMedia } from '../../composables/backgroundCatalog';
import { resolvePublicAssetUrl } from '~/utils/public-asset';
import { decodeVideoPoster } from '~/media/playback';
import { mediaSourceDescriptor } from '~/media/shared';
import type { MediaAsset } from '~/media/shared/composition-types';

const CACHE_LIMIT = 180;
const sharedPreviewCache = new Map<string, string>();
const sharedFailedCache = new Set<string>();
const sharedOrder: string[] = [];

export const clearBackgroundPreviewCache = () => {
  for (const [, url] of sharedPreviewCache) {
    URL.revokeObjectURL(url);
  }
  sharedPreviewCache.clear();
  sharedFailedCache.clear();
  sharedOrder.length = 0;
};

const videoAsset = (media: BackgroundMedia, source: string): MediaAsset => ({
  id: media.id,
  kind: 'video',
  name: media.name,
  fileName: media.fileName ?? null,
  durationMs: 0,
  width: null,
  height: null,
  src: source,
  origin: 'project',
});

const canvasBlob = (canvas: HTMLCanvasElement) =>
  new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error('Video preview unavailable'))),
      'image/jpeg',
      0.72,
    );
  });

const videoPreview = async (media: BackgroundMedia, source: string, signal: AbortSignal): Promise<Blob> => {
  if (signal.aborted) throw new DOMException('Background preview aborted.', 'AbortError');
  const frame = await decodeVideoPoster(mediaSourceDescriptor(videoAsset(media, source)), {
    position: 0.5,
    width: 240,
    height: 180,
    fit: 'cover',
  });
  try {
    if (signal.aborted) throw new DOMException('Background preview aborted.', 'AbortError');
    const canvas = document.createElement('canvas');
    canvas.width = 240;
    canvas.height = 180;
    const context = canvas.getContext('2d');
    if (!context) throw new Error('Video preview unavailable');
    context.drawImage(frame.bitmap, 0, 0, canvas.width, canvas.height);
    return await canvasBlob(canvas);
  } finally {
    frame.close();
  }
};

export function useBackgroundPreviews() {
  const previews = reactive<Record<string, string>>({});
  const failed = reactive<Record<string, boolean>>({});
  const pending = new Set<string>();
  const videoQueue: Array<{ media: BackgroundMedia; source: string }> = [];
  const worker = new BackgroundPreviewWorker();
  let activeVideoAbort: AbortController | null = null;
  let processingVideo = false;
  let disposed = false;

  for (const [id, url] of sharedPreviewCache) {
    previews[id] = url;
  }
  for (const id of sharedFailedCache) {
    failed[id] = true;
  }

  const release = (id: string) => {
    const url = sharedPreviewCache.get(id) ?? previews[id];
    if (url) URL.revokeObjectURL(url);
    sharedPreviewCache.delete(id);
    delete previews[id];
    delete failed[id];
    sharedFailedCache.delete(id);
  };

  const storePreview = (id: string, blob: Blob) => {
    const existingUrl = sharedPreviewCache.get(id);
    if (existingUrl) URL.revokeObjectURL(existingUrl);
    const url = URL.createObjectURL(blob);
    sharedPreviewCache.set(id, url);
    previews[id] = url;
    sharedOrder.push(id);
    while (sharedOrder.length > CACHE_LIMIT) {
      const expired = sharedOrder.shift();
      if (expired) release(expired);
    }
  };

  worker.onmessage = (event: MessageEvent) => {
    if (disposed) return;
    const { type, id, preview } = event.data;
    if (type === 'error') {
      pending.delete(id);
      failed[id] = true;
      sharedFailedCache.add(id);
      return;
    }
    if (type !== 'ready' || !preview) return;
    pending.delete(id);
    storePreview(id, preview as Blob);
  };

  const processNextVideo = () => {
    if (disposed || processingVideo) return;
    const next = videoQueue.shift();
    if (!next) return;
    processingVideo = true;
    const abort = new AbortController();
    activeVideoAbort = abort;
    void videoPreview(next.media, next.source, abort.signal)
      .then((preview) => {
        if (disposed) return;
        pending.delete(next.media.id);
        storePreview(next.media.id, preview);
      })
      .catch(() => {
        if (disposed) return;
        pending.delete(next.media.id);
        failed[next.media.id] = true;
        sharedFailedCache.add(next.media.id);
      })
      .finally(() => {
        processingVideo = false;
        if (activeVideoAbort === abort) activeVideoAbort = null;
        processNextVideo();
      });
  };

  const request = (media: BackgroundMedia) => {
    if (sharedPreviewCache.has(media.id)) {
      previews[media.id] = sharedPreviewCache.get(media.id)!;
      return;
    }
    if (sharedFailedCache.has(media.id)) {
      failed[media.id] = true;
      return;
    }
    if (previews[media.id] || failed[media.id] || pending.has(media.id)) return;
    pending.add(media.id);
    const source = resolvePublicAssetUrl(media.path);
    if (media.kind === 'image') worker.postMessage({ type: 'request', id: media.id, source });
    else {
      videoQueue.push({ media, source });
      processNextVideo();
    }
  };

  onUnmounted(() => {
    disposed = true;
    activeVideoAbort?.abort();
    videoQueue.length = 0;
    pending.clear();
    worker.terminate();
  });

  return { previews, failed, request };
}
