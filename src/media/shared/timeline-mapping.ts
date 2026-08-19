import { clipEndMs, type Clip, type ClipComposition } from './composition-types';
import { snapTimeToBoundary } from './time-boundary';

export const compositionDurationMs = (composition: ClipComposition) =>
  composition.clips.reduce((duration, clip) => Math.max(duration, clipEndMs(clip)), 0);

export const assetForClip = (composition: ClipComposition, clip: Clip) =>
  clip.kind === 'caption' || clip.kind === 'blur'
    ? null
    : (composition.assets.find((asset) => asset.id === clip.assetId) ?? null);

export function sourceTimeAt(clip: Clip, timelineTimeMs: number): number | null {
  const endMs = clipEndMs(clip);
  const timeMs = snapTimeToBoundary(timelineTimeMs, clip.timelineStartMs, endMs);
  if (!Number.isFinite(timeMs) || timeMs < clip.timelineStartMs || timeMs >= endMs) {
    return null;
  }
  if ('freezeFrameSourceMs' in clip && clip.freezeFrameSourceMs !== undefined) return clip.freezeFrameSourceMs;
  return Math.round(clip.sourceInMs + (timeMs - clip.timelineStartMs) * clip.playbackRate);
}

export const activeClipsAt = (composition: ClipComposition, timelineTimeMs: number) =>
  composition.clips
    .filter((clip) => clip.enabled && sourceTimeAt(clip, timelineTimeMs) !== null)
    .sort((left, right) => left.order - right.order);
