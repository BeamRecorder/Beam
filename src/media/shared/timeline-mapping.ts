import { clipEndMs, type Clip, type ClipComposition } from './composition-types';

export const compositionDurationMs = (composition: ClipComposition) =>
  composition.clips.reduce((duration, clip) => Math.max(duration, clipEndMs(clip)), 0);

export const assetForClip = (composition: ClipComposition, clip: Clip) =>
  clip.kind === 'caption' ? null : (composition.assets.find((asset) => asset.id === clip.assetId) ?? null);

export function sourceTimeAt(clip: Clip, timelineTimeMs: number): number | null {
  if (!Number.isFinite(timelineTimeMs) || timelineTimeMs < clip.timelineStartMs || timelineTimeMs >= clipEndMs(clip)) {
    return null;
  }
  return Math.round(clip.sourceInMs + (timelineTimeMs - clip.timelineStartMs) * clip.playbackRate);
}

export const activeClipsAt = (composition: ClipComposition, timelineTimeMs: number) =>
  composition.clips
    .filter((clip) => clip.enabled && sourceTimeAt(clip, timelineTimeMs) !== null)
    .sort((left, right) => left.order - right.order);
