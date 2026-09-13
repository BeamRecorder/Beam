import { isVisualClip, type ClipComposition } from '../shared';
import { snapTimeToBoundary } from '../shared/time-boundary';
import type { FrameLruCache } from './frame-cache';
import type { PreviewQuality } from './playback-preview';

export function cachedSeekFrames(
  composition: ClipComposition | null,
  cache: FrameLruCache,
  targetSeconds: number,
  quality: PreviewQuality,
) {
  const frames = new Map<string, string>();
  let complete = true;
  for (const clip of composition?.clips ?? []) {
    if (!clip.enabled || !isVisualClip(clip) || clip.kind === 'image') continue;
    const start = clip.timelineStartMs / 1_000;
    const end = (clip.timelineStartMs + clip.timelineDurationMs) / 1_000;
    const time = snapTimeToBoundary(targetSeconds, start, end);
    if (time < start || time >= end) continue;
    const source =
      clip.freezeFrameSourceMs !== undefined
        ? clip.freezeFrameSourceMs / 1_000
        : clip.sourceInMs / 1_000 + (time - start) * clip.playbackRate;
    const exact = cache.findCoveringKey(clip.id, source, `${quality}:`);
    const key = exact ?? cache.findMatchingKey(clip.id, source, `${quality}:`);
    if (key) {
      cache.get(key); // Keep the displayed frame hot in the LRU.
      frames.set(clip.id, key);
    }
    if (!exact) complete = false;
  }
  return { frames, complete: complete && frames.size > 0 };
}
