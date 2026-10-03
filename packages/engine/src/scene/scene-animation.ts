import type { ClipComposition } from '../shared/composition-types';
import type { PropertyTrack } from './scene-types';
import { sceneClocks, propertyTrackTime, authoredSceneComposition } from './scene-clock';
import { samplePropertyTrack } from './keyframes';
import { propertyPath, writeProperty } from './property-path';
import { timingPreviewFor } from '../composition/timing-preview';

export function createSceneAnimator(composition: ClipComposition) {
  composition = authoredSceneComposition(composition);
  const tracks = new Map<string, Array<{ track: PropertyTrack; path: string[] }>>();
  for (const track of composition.animations?.tracks ?? []) {
    const entries = tracks.get(track.targetId) ?? [];
    entries.push({ track, path: propertyPath(track.property) });
    tracks.set(track.targetId, entries);
  }
  if (!tracks.size)
    return <T extends object & { id: string }>(target: T, _timeMs: number, _startMs?: number): T => target;
  const clocks = sceneClocks(composition);
  const localTargets = new Set(
    composition.animations?.tracks.filter((track) => track.timeSpace === 'local').map((track) => track.targetId),
  );
  const preview = timingPreviewFor(composition);
  const starts = !localTargets.size
    ? new Map<string, number>()
    : preview
      ? new Map([...localTargets].map((id) => [id, preview.clip(id)?.timelineStartMs ?? 0]))
      : new Map(
          composition.clips.filter((clip) => localTargets.has(clip.id)).map((clip) => [clip.id, clip.timelineStartMs]),
        );
  return <T extends object & { id: string }>(target: T, timeMs: number, startMs = starts.get(target.id) ?? 0): T => {
    let result = target;
    for (const { track, path } of tracks.get(target.id) ?? []) {
      const clock = clocks.get(target.id);
      result = writeProperty(
        result,
        path,
        samplePropertyTrack(track, propertyTrackTime(track, timeMs, clock, startMs)),
      );
    }
    return result;
  };
}
