import { ownedMediaFrame } from '@beam/runtime/shared/media-frame';
import type { HtmlPreviewFrame, HtmlPreviewServices } from './html-preview-types';
import type { MediaFrame } from '@beam/runtime/shared/media-types';

/** Coalesces playback ticks; stale code revisions and seek results never replace newer frames. */
export function createHtmlPreview(services: HtmlPreviewServices) {
  const frames = new Map<string, { key: string; frame: MediaFrame }>();
  const attempted = new Map<string, string>();
  const failedSources = new Set<string>();
  let desired: HtmlPreviewFrame[] = [];
  let running = false,
    disposed = false;
  const sourceFor = (item: HtmlPreviewFrame) => `${item.html.id}:${item.html.revision}:`;
  const keyFor = (item: HtmlPreviewFrame) => `${sourceFor(item)}${item.timeMs}:${item.playbackEpoch ?? 'seek'}`;
  const pump = async () => {
    if (running || disposed) return;
    running = true;
    try {
      while (!disposed) {
        const item = desired.find(
          (candidate) =>
            !failedSources.has(sourceFor(candidate)) && attempted.get(candidate.clipId) !== keyFor(candidate),
        );
        if (!item) break;
        const key = keyFor(item);
        attempted.set(item.clipId, key);
        try {
          const bitmap = await services.render(item.html, item.timeMs);
          const latest = desired.find((candidate) => candidate.clipId === item.clipId);
          // A moving playback clock must accept its completed frame. Explicit
          // seeks, pauses and source changes invalidate that playback epoch.
          const followsPlayback =
            latest &&
            item.playbackEpoch !== undefined &&
            latest.playbackEpoch === item.playbackEpoch &&
            latest.timeMs >= item.timeMs;
          if (
            disposed ||
            !latest ||
            sourceFor(latest) !== sourceFor(item) ||
            (!followsPlayback && keyFor(latest) !== key)
          ) {
            bitmap.close();
            continue;
          }
          frames.get(item.clipId)?.frame.close();
          frames.set(item.clipId, {
            key,
            frame: ownedMediaFrame(item.clipId, bitmap, item.timeMs / 1000, 1 / item.html.fps),
          });
          services.changed();
        } catch (error) {
          if (!disposed && !failedSources.has(sourceFor(item))) {
            failedSources.add(sourceFor(item));
            services.failed(error);
          }
        }
      }
    } finally {
      running = false;
    }
  };
  return {
    update(next: HtmlPreviewFrame[]) {
      if (disposed) return;
      desired = next;
      for (const source of failedSources)
        if (!next.some((item) => sourceFor(item) === source)) failedSources.delete(source);
      for (const [clipId, stored] of frames) {
        const item = next.find((candidate) => candidate.clipId === clipId);
        if (!item || !stored.key.startsWith(`${item.html.id}:${item.html.revision}:`)) {
          stored.frame.close();
          frames.delete(clipId);
          attempted.delete(clipId);
          services.changed();
        }
      }
      for (const id of attempted.keys()) if (!next.some((item) => item.clipId === id)) attempted.delete(id);
      void pump();
    },
    frameFor(clipId: string) {
      return frames.get(clipId)?.frame ?? null;
    },
    dispose() {
      disposed = true;
      desired = [];
      for (const { frame } of frames.values()) frame.close();
      frames.clear();
      attempted.clear();
      failedSources.clear();
    },
  };
}
