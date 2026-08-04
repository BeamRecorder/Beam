import { onUnmounted, reactive } from "vue";
import BackgroundPreviewWorker from "./background-preview.worker?worker&inline";
import type { BackgroundMedia } from "../../composables/backgroundCatalog";
import { resolvePublicAssetUrl } from "~/utils/public-asset";

const CACHE_LIMIT = 180;

export const videoPreviewTime = (duration: number) =>
  Number.isFinite(duration) && duration > 0 ? duration / 2 : 0;

const videoPreview = (source: string) => new Promise<Blob>((resolve, reject) => {
  const video = document.createElement("video");
  video.muted = true;
  video.preload = "metadata";
  const fail = () => { cleanup(); reject(new Error("Video preview unavailable")); };
  const cleanup = () => { video.removeEventListener("error", fail); video.removeEventListener("loadedmetadata", seek); video.removeEventListener("seeked", capture); video.remove(); };
  const capture = () => {
    const canvas = document.createElement("canvas"); canvas.width = 240; canvas.height = 180;
    const context = canvas.getContext("2d");
    if (!context) return fail();
    context.drawImage(video, 0, 0, canvas.width, canvas.height);
    canvas.toBlob((blob) => { cleanup(); blob ? resolve(blob) : reject(new Error("Video preview unavailable")); }, "image/jpeg", 0.72);
  };
  const seek = () => {
    const time = videoPreviewTime(video.duration);
    if (time === 0) capture();
    else video.currentTime = time;
  };
  video.addEventListener("error", fail, { once: true });
  video.addEventListener("loadedmetadata", seek, { once: true });
  video.addEventListener("seeked", capture, { once: true });
  video.src = source;
});

export function useBackgroundPreviews() {
  const previews = reactive<Record<string, string>>({});
  const failed = reactive<Record<string, boolean>>({});
  const pending = new Set<string>();
  const order: string[] = [];
  const worker = new BackgroundPreviewWorker();

  const release = (id: string) => {
    const url = previews[id];
    if (url) URL.revokeObjectURL(url);
    delete previews[id];
    delete failed[id];
  };

  worker.onmessage = (event: MessageEvent) => {
    const { type, id, preview } = event.data;
    if (type === "error") {
      pending.delete(id);
      failed[id] = true;
      return;
    }
    if (type !== "ready" || !preview) return;
    pending.delete(id);
    release(id);
    previews[id] = URL.createObjectURL(preview as Blob);
    order.push(id);
    while (order.length > CACHE_LIMIT) {
      const expired = order.shift();
      if (expired) release(expired);
    }
  };

  const request = (media: BackgroundMedia) => {
    if (previews[media.id] || failed[media.id] || pending.has(media.id)) return;
    pending.add(media.id);
    const source = resolvePublicAssetUrl(media.path);
    if (media.kind === "image") worker.postMessage({ type: "request", id: media.id, source });
    else void videoPreview(source).then((preview) => {
      pending.delete(media.id); previews[media.id] = URL.createObjectURL(preview); order.push(media.id);
      while (order.length > CACHE_LIMIT) { const expired = order.shift(); if (expired) release(expired); }
    }).catch(() => { pending.delete(media.id); failed[media.id] = true; });
  };

  onUnmounted(() => {
    for (const id of Object.keys(previews)) release(id);
    pending.clear();
    worker.terminate();
  });

  return { previews, failed, request };
}
