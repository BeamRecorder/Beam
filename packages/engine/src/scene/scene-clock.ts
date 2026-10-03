import type { ClipComposition } from '../shared/composition-types';
import type { SceneClock, PropertyTrack } from './scene-types';

const compiled = new WeakMap<ClipComposition, ClipComposition>();
const clocks = new WeakMap<ClipComposition, ReadonlyMap<string, SceneClock>>();
const authored = new WeakMap<ClipComposition, ClipComposition>();
export const authoredSceneComposition = (composition: ClipComposition) => authored.get(composition) ?? composition;

export function propertyTrackTime(track: PropertyTrack, timeMs: number, clock?: SceneClock, startMs = 0) {
  return (
    (track.timeSpace === 'local' ? (timeMs - (clock?.offsetMs ?? 0)) * (clock?.rate ?? 1) - startMs : timeMs) +
    (track.timeOffsetMs ?? 0)
  );
}

export function sceneClocks(composition: ClipComposition): ReadonlyMap<string, SceneClock> {
  const cached = clocks.get(composition);
  if (cached) return cached;
  const result = new Map<string, SceneClock>();
  const groups = new Map(composition.scene?.groups.map((group) => [group.id, group]));
  const visit = (id: string, parent: SceneClock) => {
    const group = groups.get(id);
    const clock = group?.timing
      ? {
          offsetMs: parent.offsetMs + group.timing.startMs / parent.rate,
          rate: parent.rate * group.timing.rate,
        }
      : parent;
    result.set(id, clock);
    if (group) for (const child of group.children) visit(child, clock);
  };
  for (const id of composition.scene?.roots ?? []) visit(id, { offsetMs: 0, rate: 1 });
  clocks.set(composition, result);
  return result;
}

/** Compile hierarchy clocks once per authored document. Media planners consume these world intervals. */
export function compileSceneComposition(composition: ClipComposition): ClipComposition {
  if (!composition.scene) return composition;
  const cached = compiled.get(composition);
  if (cached) return cached;
  const timing = sceneClocks(composition);
  const result = {
    ...composition,
    clips: composition.clips.map((clip) => {
      const clock = timing.get(clip.id);
      return !clock || (clock.offsetMs === 0 && clock.rate === 1)
        ? clip
        : {
            ...clip,
            timelineStartMs: clock.offsetMs + clip.timelineStartMs / clock.rate,
            timelineDurationMs: clip.timelineDurationMs / clock.rate,
            playbackRate: clip.playbackRate * clock.rate,
            transitions: {
              entry: clip.transitions?.entry
                ? { ...clip.transitions.entry, durationMs: clip.transitions.entry.durationMs / clock.rate }
                : null,
              exit: clip.transitions?.exit
                ? { ...clip.transitions.exit, durationMs: clip.transitions.exit.durationMs / clock.rate }
                : null,
            },
          };
    }),
  };
  compiled.set(composition, result);
  compiled.set(result, result);
  authored.set(result, composition);
  return result;
}
