import { clipEndMs, isVisualClip, type Clip, type ClipComposition } from '../shared';

export function createPlaybackClipIndex(composition: ClipComposition | null) {
  const clips = new Map<string, Clip>();
  const previous = new Map<string, string>();
  const endings = new Map<string | undefined, Map<string, Map<number, string>>>();
  for (const clip of composition?.clips ?? []) {
    if (!clips.has(clip.id)) clips.set(clip.id, clip);
    if (!clip.enabled || !isVisualClip(clip)) continue;
    let track = endings.get(clip.trackId);
    if (!track) endings.set(clip.trackId, (track = new Map()));
    let asset = track.get(clip.assetId);
    if (!asset) track.set(clip.assetId, (asset = new Map()));
    const end = clipEndMs(clip);
    if (!asset.has(end)) asset.set(end, clip.id);
  }
  for (const clip of clips.values()) {
    if (!isVisualClip(clip)) continue;
    const predecessor = endings.get(clip.trackId)?.get(clip.assetId)?.get(clip.timelineStartMs);
    if (predecessor !== undefined) previous.set(clip.id, predecessor);
  }
  return { clips, previous };
}
