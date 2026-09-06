import { clipEndMs, isVisualClip, type Clip, type ClipComposition } from '~/media/shared/composition-types';
import type { TimelineGap } from './timeline-lock-types';
import { prepareTimelineSelectionMove } from './timeline-selection-move';
import { selectionHasLocks } from './timeline-locks';

export const timelineGaps = (clips: readonly Clip[]): TimelineGap[] => {
  const ordered = [...clips].sort((a, b) => a.timelineStartMs - b.timelineStartMs);
  const clipIds = ordered.map((clip) => clip.id);
  const gaps: TimelineGap[] = [];
  let endMs = 0;
  for (const clip of ordered) {
    if (clip.timelineStartMs > endMs) gaps.push({ clipIds, startMs: endMs, endMs: clip.timelineStartMs });
    endMs = Math.max(endMs, clipEndMs(clip));
  }
  return gaps;
};

export const removeTimelineGap = (composition: ClipComposition, gap: TimelineGap): ClipComposition => {
  const ids = new Set(gap.clipIds);
  const first = composition.clips.find((clip) => ids.has(clip.id));
  if (!first) return composition;
  const lane = composition.clips.filter((clip) =>
    isVisualClip(first)
      ? isVisualClip(clip) && clip.trackId === first.trackId
      : first.kind === 'audio' && first.role === 'microphone' && clip.kind === 'audio' && clip.role === 'microphone',
  );
  if (lane.some((clip) => !ids.has(clip.id))) return composition;
  if (
    lane.length !== ids.size ||
    !timelineGaps(lane).some((candidate) => candidate.startMs === gap.startMs && candidate.endMs === gap.endMs)
  )
    return composition;
  const clipIds = lane.filter((clip) => clip.timelineStartMs >= gap.endMs).map((clip) => clip.id);
  if (selectionHasLocks(composition, [], { clipIds, zoomIds: [] })) return composition;
  const delta = gap.startMs - gap.endMs;
  const result = prepareTimelineSelectionMove({ composition, zoomElements: [], selection: { clipIds, zoomIds: [] } })(
    delta,
  );
  return result.deltaMs === delta ? result.composition : composition;
};
