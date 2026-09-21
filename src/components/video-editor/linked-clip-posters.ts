import { onUnmounted, reactive, watch, type Ref } from 'vue';
import { mediaSourceDescriptor } from '~/media/shared/media-source';
import type { Clip, MediaAsset } from '~/media/shared/composition-types';

type PosterRequest = { key: string; clip: Clip; asset: MediaAsset };
const posterKey = (clip: Clip, asset: MediaAsset) =>
  `${asset.id}\u0000${asset.src}\u0000${clip.sourceInMs}\u0000${clip.sourceDurationMs}`;
const posterBlob = (canvas: HTMLCanvasElement) =>
  new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error('Poster encoding failed.'))), 'image/jpeg', 0.8);
  });

export function useLinkedClipPosters(isOpen: Ref<boolean>) {
  const urls = reactive<Record<string, string>>({});
  const pending = new Map<string, number>();
  const failed = new Set<string>();
  const queue: PosterRequest[] = [];
  let generation = 0;
  let processing = false;

  const clear = () => {
    generation += 1;
    queue.length = 0;
    pending.clear();
    failed.clear();
    for (const [key, url] of Object.entries(urls)) {
      URL.revokeObjectURL(url);
      delete urls[key];
    }
  };
  watch(isOpen, (open) => {
    if (!open) clear();
  });
  onUnmounted(clear);

  const process = async () => {
    if (processing) return;
    processing = true;
    try {
      while (queue.length) {
        const request = queue.shift()!;
        const requestedGeneration = generation;
        try {
          const { decodeVideoPoster } = await import('~/media/playback');
          if (requestedGeneration !== generation) continue;
          const frame = await decodeVideoPoster(mediaSourceDescriptor(request.asset), {
            timestampSeconds: (request.clip.sourceInMs + Math.min(250, request.clip.sourceDurationMs / 2)) / 1_000,
            width: 160,
            height: 90,
            fit: 'cover',
          });
          try {
            if (requestedGeneration !== generation) continue;
            const canvas = document.createElement('canvas');
            canvas.width = 160;
            canvas.height = 90;
            const context = canvas.getContext('2d');
            if (!context) throw new Error('Poster canvas unavailable.');
            context.drawImage(frame.bitmap, 0, 0, canvas.width, canvas.height);
            const blob = await posterBlob(canvas);
            if (requestedGeneration === generation) urls[request.key] = URL.createObjectURL(blob);
          } finally {
            frame.close();
          }
        } catch {
          if (requestedGeneration === generation) failed.add(request.key);
        } finally {
          if (pending.get(request.key) === requestedGeneration) pending.delete(request.key);
        }
      }
    } finally {
      processing = false;
      if (queue.length) void process();
    }
  };

  return {
    posterUrl(clip: Clip, asset?: MediaAsset | null) {
      return asset?.kind === 'video' ? urls[posterKey(clip, asset)] : undefined;
    },
    requestPoster(clip: Clip, asset?: MediaAsset | null) {
      if (!isOpen.value || asset?.kind !== 'video') return;
      const key = posterKey(clip, asset);
      if (urls[key] || pending.has(key) || failed.has(key)) return;
      pending.set(key, generation);
      queue.push({ key, clip, asset });
      void process();
    },
  };
}
