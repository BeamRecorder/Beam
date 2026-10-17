import { mayBeEnabled } from '@beam/engine/scene/scene-visibility';
import { clipEndMs, isVisualClip, type Clip, type ClipComposition, type VisualClip } from '@beam/runtime/shared/index';
import { createTimelineIntervalIndex } from '@beam/engine/shared/timeline-interval-index';

export function createPlaybackClipIndex(composition: ClipComposition | null) {
  const clips = new Map<string, Clip>();
  const previous = new Map<string, string>();
  const endings = new Map<string | undefined, Map<string, Map<number, string>>>();
  for (const clip of composition?.clips ?? []) {
    if (!clips.has(clip.id)) clips.set(clip.id, clip);
    if (!mayBeEnabled(composition, clip) || !isVisualClip(clip)) continue;
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
  const activeAt = createTimelineIntervalIndex(
    [...clips.values()]
      .filter((clip) => mayBeEnabled(composition, clip) && isVisualClip(clip))
      .map((clip) => ({ start: clip.timelineStartMs / 1000, end: clipEndMs(clip) / 1000, value: clip })),
  );
  const activeVideosAt = (timeSeconds: number) =>
    activeAt(timeSeconds).filter(
      (clip): clip is VisualClip => clip.enabled && isVisualClip(clip) && clip.kind !== 'image',
    );
  const retainedKeys = (
    timeSeconds: number,
    keys: ReadonlyMap<string, string>,
    aliases: ReadonlyMap<string, string>,
  ) => {
    const retained = new Set<string>();
    for (const clip of activeAt(timeSeconds)) {
      const key = keys.get(aliases.get(clip.id) ?? clip.id);
      if (key) retained.add(key);
      else {
        const predecessor = previous.get(clip.id);
        const previousKey = predecessor ? keys.get(aliases.get(predecessor) ?? predecessor) : undefined;
        if (previousKey) retained.add(previousKey);
      }
    }
    return retained;
  };
  return { clips, previous, retainedKeys, activeVideosAt };
}
