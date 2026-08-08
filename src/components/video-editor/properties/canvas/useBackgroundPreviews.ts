import { onUnmounted, reactive } from 'vue';
import BackgroundPreviewWorker from './background-preview.worker?worker&inline';
import type { BackgroundMedia } from '../../composables/backgroundCatalog';
import { resolvePublicAssetUrl } from '~/utils/public-asset';

const CACHE_LIMIT = 180;

export const videoPreviewTime = (duration: number) => (Number.isFinite(duration) && duration > 0 ? duration / 2 : 0);

const videoPreview = (source: string, signal: AbortSignal) =>
  new Promise<Blob>((resolve, reject) => {
    const video = document.createElement('video');
    let settled = false;
    video.muted = true;
    video.preload = 'metadata';
    const fail = () => {
      if (settled) return;
      settled = true;
      cleanup();
      reject(new Error('Video preview unavailable'));
    };
    const cleanup = () => {
      signal.removeEventListener('abort', fail);
      video.removeEventListener('error', fail);
      video.removeEventListener('loadedmetadata', seek);
      video.removeEventListener('seeked', capture);
      video.remove();
    };
    const capture = () => {
      const canvas = document.createElement('canvas');
      canvas.width = 240;
      canvas.height = 180;
      const context = canvas.getContext('2d');
      if (!context) return fail();
      context.drawImage(video, 0, 0, canvas.width, canvas.height);
      canvas.toBlob(
        (blob) => {
          if (settled) return;
          settled = true;
          cleanup();
          blob ? resolve(blob) : reject(new Error('Video preview unavailable'));
        },
        'image/jpeg',
        0.72,
      );
    };
    const seek = () => {
      const time = videoPreviewTime(video.duration);
      if (time === 0) capture();
      else video.currentTime = time;
    };
    video.addEventListener('error', fail, { once: true });
    video.addEventListener('loadedmetadata', seek, { once: true });
    video.addEventListener('seeked', capture, { once: true });
    signal.addEventListener('abort', fail, { once: true });
    if (signal.aborted) return fail();
    video.src = source;
  });

export function useBackgroundPreviews() {
  const previews = reactive<Record<string, string>>({});
  const failed = reactive<Record<string, boolean>>({});
  const pending = new Set<string>();
  const order: string[] = [];
  const videoQueue: Array<{ id: string; source: string }> = [];
  const worker = new BackgroundPreviewWorker();
  let activeVideoAbort: AbortController | null = null;
  let processingVideo = false;
  let disposed = false;

  const release = (id: string) => {
    const url = previews[id];
    if (url) URL.revokeObjectURL(url);
    delete previews[id];
    delete failed[id];
  };

  worker.onmessage = (event: MessageEvent) => {
    if (disposed) return;
    const { type, id, preview } = event.data;
    if (type === 'error') {
      pending.delete(id);
      failed[id] = true;
      return;
    }
    if (type !== 'ready' || !preview) return;
    pending.delete(id);
    release(id);
    previews[id] = URL.createObjectURL(preview as Blob);
    order.push(id);
    while (order.length > CACHE_LIMIT) {
      const expired = order.shift();
      if (expired) release(expired);
    }
  };

  const processNextVideo = () => {
    if (disposed || processingVideo) return;
    const next = videoQueue.shift();
    if (!next) return;
    processingVideo = true;
    const abort = new AbortController();
    activeVideoAbort = abort;
    void videoPreview(next.source, abort.signal)
      .then((preview) => {
        if (disposed) return;
        pending.delete(next.id);
        previews[next.id] = URL.createObjectURL(preview);
        order.push(next.id);
        while (order.length > CACHE_LIMIT) {
          const expired = order.shift();
          if (expired) release(expired);
        }
      })
      .catch(() => {
        if (disposed) return;
        pending.delete(next.id);
        failed[next.id] = true;
      })
      .finally(() => {
        processingVideo = false;
        if (activeVideoAbort === abort) activeVideoAbort = null;
        processNextVideo();
      });
  };

  const request = (media: BackgroundMedia) => {
    if (previews[media.id] || failed[media.id] || pending.has(media.id)) return;
    pending.add(media.id);
    const source = resolvePublicAssetUrl(media.path);
    if (media.kind === 'image') worker.postMessage({ type: 'request', id: media.id, source });
    else {
      videoQueue.push({ id: media.id, source });
      processNextVideo();
    }
  };

  onUnmounted(() => {
    disposed = true;
    activeVideoAbort?.abort();
    videoQueue.length = 0;
    for (const id of Object.keys(previews)) release(id);
    pending.clear();
    worker.terminate();
  });

  return { previews, failed, request };
}
