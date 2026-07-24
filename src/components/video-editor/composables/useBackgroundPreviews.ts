import { onUnmounted, reactive } from "vue";
import BackgroundPreviewWorker from "./background-preview.worker?worker&inline";
import type { BackgroundMedia } from "./backgroundCatalog";

const CACHE_LIMIT = 180;

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
    if (
      media.kind !== "image" ||
      previews[media.id] ||
      failed[media.id] ||
      pending.has(media.id)
    ) return;
    pending.add(media.id);
    worker.postMessage({ type: "request", id: media.id, source: media.path });
  };

  onUnmounted(() => {
    for (const id of Object.keys(previews)) release(id);
    pending.clear();
    worker.terminate();
  });

  return { previews, failed, request };
}
