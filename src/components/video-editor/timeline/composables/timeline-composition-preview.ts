import type { Clip, ClipComposition } from '~/media/shared/composition-types';

const linkedIds = (composition: ClipComposition, clip: Clip) =>
  new Set(
    clip.groupId
      ? composition.clips.filter((entry) => entry.groupId === clip.groupId).map((entry) => entry.id)
      : [clip.id],
  );

export function previewClipMove(composition: ClipComposition, clip: Clip, timelineStartMs: number): ClipComposition {
  const ids = linkedIds(composition, clip);
  const deltaMs = timelineStartMs - clip.timelineStartMs;
  return {
    ...composition,
    clips: composition.clips.map((entry) =>
      ids.has(entry.id) ? { ...entry, timelineStartMs: entry.timelineStartMs + deltaMs } : entry,
    ),
  };
}

export function previewClipTrim(
  composition: ClipComposition,
  clip: Clip,
  edge: 'start' | 'end',
  timelineTimeMs: number,
): ClipComposition {
  const ids = linkedIds(composition, clip);
  return {
    ...composition,
    clips: composition.clips.map((entry) => {
      if (!ids.has(entry.id)) return entry;
      if (edge === 'end') {
        const timelineDurationMs = timelineTimeMs - entry.timelineStartMs;
        return {
          ...entry,
          timelineDurationMs,
          sourceDurationMs: Math.round(timelineDurationMs * Math.max(0.01, entry.playbackRate)),
        };
      }
      const startDeltaMs = timelineTimeMs - entry.timelineStartMs;
      const timelineDurationMs = entry.timelineStartMs + entry.timelineDurationMs - timelineTimeMs;
      const sourceDurationMs = Math.round(timelineDurationMs * Math.max(0.01, entry.playbackRate));
      return {
        ...entry,
        timelineStartMs: timelineTimeMs,
        timelineDurationMs,
        sourceInMs:
          entry.kind === 'caption'
            ? 0
            : Math.max(0, entry.sourceInMs + Math.round(startDeltaMs * Math.max(0.01, entry.playbackRate))),
        sourceDurationMs,
      };
    }),
  };
}
