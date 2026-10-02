import { createTimelineIntervalIndex } from '~/media/shared/timeline-interval-index';
import { snapTimeToBoundary } from '~/media/shared/time-boundary';
import type { Clip, ClipComposition } from '~/media/shared/composition-types';
import type { TimingPreview, TimingPreviewFactory } from './timing-preview-types';

const previews = new WeakMap<ClipComposition, TimingPreview>();
export const timingPreviewFor = (composition: ClipComposition) => previews.get(composition);

/** Build stationary indexes once. Each pointer update contains only the moved records. */
export function prepareTimingPreview(base: ClipComposition, movingIds: ReadonlySet<string>): TimingPreviewFactory {
  const indices = new Map(base.clips.map((clip, index) => [clip.id, index]));
  const enabledVisuals = new Map(
    base.clips.flatMap((clip) =>
      clip.kind === 'screen' || clip.kind === 'video' || clip.kind === 'webcam'
        ? [[clip.id, clip.enabled] as const]
        : [],
    ),
  );
  const stationary = base.clips.filter((clip) => !movingIds.has(clip.id) && clip.enabled && clip.kind !== 'audio');
  const index = (clips: readonly Clip[]) =>
    createTimelineIntervalIndex(
      clips.map((clip) => ({
        start: clip.timelineStartMs,
        end: clip.timelineStartMs + clip.timelineDurationMs,
        value: clip,
      })),
    );
  const at = index(stationary);
  const screensAt = index(stationary.filter((clip) => clip.kind === 'screen'));
  return (patches) => {
    const replacements = new Map(patches.map((clip) => [clip.id, clip]));
    for (const id of replacements.keys())
      if (!movingIds.has(id) || !indices.has(id)) throw new Error('Unexpected timing preview clip.');
    for (const id of movingIds) {
      if (indices.has(id) && !replacements.has(id)) throw new Error('Missing timing preview clip.');
    }
    let materialized: Clip[] | null = null;
    const composition = {
      ...base,
      get clips() {
        // Inspector/document consumers can request an ordinary immutable snapshot.
        // The renderer reads the sparse indexes directly and never needs this copy.
        if (!materialized) {
          materialized = [...base.clips];
          for (const [id, clip] of replacements) materialized[indices.get(id)!] = clip;
        }
        return materialized;
      },
    };
    previews.set(composition, {
      patches: replacements,
      order: (clip) => indices.get(clip.id) ?? 0,
      clip: (id) => replacements.get(id) ?? base.clips[indices.get(id) ?? -1],
      visualEnabledStates: () => {
        const states = new Map(enabledVisuals);
        for (const clip of replacements.values()) {
          states.delete(clip.id);
          if (clip.kind === 'screen' || clip.kind === 'video' || clip.kind === 'webcam')
            states.set(clip.id, clip.enabled);
        }
        return states;
      },
      at: (timeMs, screensOnly = false) => {
        const result = screensOnly ? screensAt(timeMs) : at(timeMs);
        for (const clip of replacements.values()) {
          if (!clip.enabled || clip.kind === 'audio' || (screensOnly && clip.kind !== 'screen')) continue;
          const end = clip.timelineStartMs + clip.timelineDurationMs;
          const time = snapTimeToBoundary(timeMs, clip.timelineStartMs, end);
          if (time >= clip.timelineStartMs && time < end) result.push(clip);
        }
        return result;
      },
    });
    return composition;
  };
}
