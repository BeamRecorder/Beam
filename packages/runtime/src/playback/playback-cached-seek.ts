import type { createPlaybackClipIndex } from './playback-clip-index';
import { snapTimeToBoundary } from '@beam/engine/shared/time-boundary';
import type { FrameLruCache } from '@beam/runtime/playback/frame-cache';
import type { PreviewQuality } from '@beam/runtime/playback/playback-preview';

export function cachedSeekFrames(
  clipIndex: Pick<ReturnType<typeof createPlaybackClipIndex>, 'activeVideosAt'>,
  cache: FrameLruCache,
  targetSeconds: number,
  quality: PreviewQuality,
  aliases: ReadonlyMap<string, string> = new Map(),
) {
  const frames = new Map<string, string>();
  let complete = true;
  for (const clip of clipIndex.activeVideosAt(targetSeconds)) {
    const start = clip.timelineStartMs / 1_000;
    const end = (clip.timelineStartMs + clip.timelineDurationMs) / 1_000;
    const time = snapTimeToBoundary(targetSeconds, start, end);
    if (time < start || time >= end) continue;
    const source =
      clip.freezeFrameSourceMs !== undefined
        ? clip.freezeFrameSourceMs / 1_000
        : clip.sourceInMs / 1_000 + (time - start) * clip.playbackRate;
    const frameClipId = aliases.get(clip.id) ?? clip.id;
    const exact = cache.findCoveringKey(frameClipId, source, `${quality}:`);
    const key = exact ?? cache.findMatchingKey(frameClipId, source, `${quality}:`);
    if (key) {
      cache.get(key); // Keep the displayed frame hot in the LRU.
      frames.set(clip.id, key);
    }
    if (!exact) complete = false;
  }
  return { frames, complete: complete && frames.size > 0 };
}
