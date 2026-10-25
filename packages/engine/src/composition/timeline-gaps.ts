import { rippleZooms } from './timeline-ripple-zooms';
import { clipEndMs, isVisualClip, type Clip, type ClipComposition } from '@beam/engine/shared/composition-types';
import type { TimelineGap } from '@beam/engine/composition/timeline-lock-types';
import { prepareTimelineSelectionMove } from '@beam/engine/composition/timeline-selection-move';
import { lockedTimelineSelection } from '@beam/engine/composition/timeline-locks';
import { recordingLinkedClipIds } from '@beam/engine/composition/recording-media-links';
import type { TimelineRange, TimelineSelectionMoveResult } from '@beam/engine/composition/timeline-edit-types';
import type { ZoomElement } from '@beam/engine/zoom/zoom-types';
import type { TimelineGapRemovalPlan } from './timeline-gap-types';

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

const sharedRecordingGap = (composition: ClipComposition, lane: readonly Clip[], gap: TimelineGap): TimelineRange => {
  const beforeIds = new Set(
    recordingLinkedClipIds(
      composition,
      lane.filter((clip) => clipEndMs(clip) === gap.startMs).map((clip) => clip.id),
    ),
  );
  const afterIds = new Set(
    recordingLinkedClipIds(
      composition,
      lane.filter((clip) => clip.timelineStartMs === gap.endMs).map((clip) => clip.id),
    ),
  );
  let startMs = gap.startMs;
  let endMs = gap.endMs;
  // Capture tracks stop and resume independently. Only remove their shared
  // empty interval; keep every frame and the recorded audio/video offsets.
  for (const clip of composition.clips) {
    if (beforeIds.has(clip.id)) startMs = Math.max(startMs, clipEndMs(clip));
    if (afterIds.has(clip.id)) endMs = Math.min(endMs, clip.timelineStartMs);
  }
  return { startMs, endMs };
};

export const planTimelineGapRemoval = (
  composition: ClipComposition,
  gap: TimelineGap,
  zoomElements: readonly ZoomElement[] = [],
): TimelineGapRemovalPlan => {
  const unchanged = { kind: 'invalid' } as const;
  const ids = new Set(gap.clipIds);
  const first = composition.clips.find((clip) => ids.has(clip.id));
  if (!first) return unchanged;
  const lane = composition.clips.filter((clip) =>
    isVisualClip(first)
      ? isVisualClip(clip) && clip.trackId === first.trackId
      : first.kind === 'audio' && first.role === 'microphone' && clip.kind === 'audio' && clip.role === 'microphone',
  );
  if (lane.some((clip) => !ids.has(clip.id))) return unchanged;
  if (
    lane.length !== ids.size ||
    !timelineGaps(lane).some((candidate) => candidate.startMs === gap.startMs && candidate.endMs === gap.endMs)
  )
    return unchanged;
  const range = sharedRecordingGap(composition, lane, gap);
  if (range.startMs >= range.endMs) return unchanged;
  const overlaps = composition.clips
    .filter((clip) => clip.timelineStartMs < range.endMs && clipEndMs(clip) > range.startMs)
    .map((clip) => clip.id);
  if (overlaps.length) return { kind: 'overlap', blockers: { clipIds: overlaps, zoomIds: [] } };
  const clipIds = composition.clips.filter((clip) => clip.timelineStartMs >= range.endMs).map((clip) => clip.id);
  const zoomIds = zoomElements.filter((zoom) => zoom.endMs > range.startMs).map((zoom) => zoom.id);
  const locked = lockedTimelineSelection(composition, zoomElements, { clipIds, zoomIds });
  if (locked.clipIds.length || locked.zoomIds.length) return { kind: 'locked', blockers: locked };
  const delta = range.startMs - range.endMs;
  const result = prepareTimelineSelectionMove({ composition, zoomElements: [], selection: { clipIds, zoomIds: [] } })(
    delta,
  );
  return result.deltaMs === delta
    ? { kind: 'removable', result: { ...result, zoomElements: rippleZooms(zoomElements, range), rippleRange: range } }
    : unchanged;
};

export const removeTimelineGap = (
  composition: ClipComposition,
  gap: TimelineGap,
  zoomElements: readonly ZoomElement[] = [],
): TimelineSelectionMoveResult => {
  const plan = planTimelineGapRemoval(composition, gap, zoomElements);
  return plan.kind === 'removable'
    ? plan.result
    : { composition, zoomElements: [...zoomElements], rippleRange: null, deltaMs: 0 };
};
