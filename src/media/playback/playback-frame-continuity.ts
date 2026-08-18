import { clipEndMs, isVisualClip, type ClipComposition } from '../shared';

export function previousContiguousVisualClipId(
  composition: ClipComposition,
  clipId: string,
  timelineTimeMs: number,
): string | null {
  const clip = composition.clips.find((entry) => entry.id === clipId);
  if (!clip || !isVisualClip(clip) || timelineTimeMs < clip.timelineStartMs || timelineTimeMs >= clipEndMs(clip)) {
    return null;
  }
  const previous = composition.clips.find(
    (entry) =>
      entry.enabled &&
      isVisualClip(entry) &&
      entry.trackId === clip.trackId &&
      entry.assetId === clip.assetId &&
      clipEndMs(entry) === clip.timelineStartMs,
  );
  return previous?.id ?? null;
}
