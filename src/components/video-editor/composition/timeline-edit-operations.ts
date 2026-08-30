import type { ClipComposition } from '~/media/shared/composition-types';
import type { ZoomElement } from '../zoom/zoom-types';
import { deleteClip } from './engine/clip-engine';
import { validateComposition } from './engine/clip-composition-validation';
import { visualMoveDeltaBounds } from './engine/visual-track-layout';
import type {
  TimelineDeleteMode,
  TimelineEditResult,
  TimelineRange,
  TimelineSelectionIds,
} from './timeline-edit-types';

export type {
  TimelineDeleteMode,
  TimelineEditResult,
  TimelineRange,
  TimelineSelectionIds,
} from './timeline-edit-types';

const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;
const endMs = (clip: ClipComposition['clips'][number]) => clip.timelineStartMs + clip.timelineDurationMs;

export const expandLinkedClipIds = (composition: ClipComposition, clipIds: readonly string[]): string[] => {
  const ids = new Set(clipIds);
  const groups = new Set(
    composition.clips.filter((clip) => ids.has(clip.id) && clip.groupId).map((clip) => clip.groupId),
  );
  for (const clip of composition.clips) if (clip.groupId && groups.has(clip.groupId)) ids.add(clip.id);
  return [...ids];
};

export const rippleRangeForSelection = (
  composition: ClipComposition,
  clipIds: readonly string[],
): TimelineRange | null => {
  const selectedIds = new Set(clipIds);
  const selected = composition.clips.filter((clip) => selectedIds.has(clip.id));
  if (!selected.length || selected.length !== selectedIds.size) return null;
  const startMs = selected[0]!.timelineStartMs;
  const rangeEndMs = endMs(selected[0]!);
  if (selected.some((clip) => clip.timelineStartMs !== startMs || endMs(clip) !== rangeEndMs)) return null;
  const overlapsUnselected = composition.clips.some(
    (clip) => !selectedIds.has(clip.id) && clip.timelineStartMs < rangeEndMs && endMs(clip) > startMs,
  );
  return overlapsUnselected ? null : { startMs, endMs: rangeEndMs };
};

const rippleZooms = (zooms: ZoomElement[], range: TimelineRange): ZoomElement[] => {
  const durationMs = range.endMs - range.startMs;
  return zooms.flatMap((zoom) => {
    if (zoom.endMs <= range.startMs) return [zoom];
    if (zoom.startMs >= range.endMs)
      return [{ ...zoom, startMs: zoom.startMs - durationMs, endMs: zoom.endMs - durationMs }];
    if (zoom.startMs >= range.startMs && zoom.endMs <= range.endMs) return [];
    const startMs = zoom.startMs < range.startMs ? zoom.startMs : range.startMs;
    const endMs = zoom.endMs - Math.min(durationMs, zoom.endMs - range.startMs);
    return endMs - startMs >= 200 ? [{ ...zoom, startMs, endMs }] : [];
  });
};

export const deleteTimelineItems = (options: {
  composition: ClipComposition;
  zoomElements: readonly ZoomElement[];
  selection: TimelineSelectionIds;
  mode: TimelineDeleteMode;
}): TimelineEditResult => {
  const clipIds = [...new Set(options.selection.clipIds)];
  const zoomIds = new Set(options.selection.zoomIds);
  const candidateRange = rippleRangeForSelection(options.composition, clipIds);
  const rippleRange =
    options.mode === 'ripple' || (options.mode === 'smart' && candidateRange?.startMs === 0) ? candidateRange : null;
  let composition = options.composition;
  for (const id of clipIds) {
    if (composition.clips.some((clip) => clip.id === id)) composition = deleteClip(composition, id, false);
  }
  let zoomElements = options.zoomElements.filter((zoom) => !zoomIds.has(zoom.id)).map((zoom) => clone(zoom));
  if (!rippleRange) return { composition, zoomElements, rippleRange: null };
  const durationMs = rippleRange.endMs - rippleRange.startMs;
  composition = {
    ...composition,
    clips: composition.clips.map((clip) =>
      clip.timelineStartMs >= rippleRange.endMs
        ? { ...clip, timelineStartMs: clip.timelineStartMs - durationMs }
        : clip,
    ),
  };
  validateComposition(composition);
  zoomElements = rippleZooms(zoomElements, rippleRange);
  return { composition, zoomElements, rippleRange };
};

export const shiftTimelineSelection = (options: {
  composition: ClipComposition;
  zoomElements: readonly ZoomElement[];
  selection: TimelineSelectionIds;
  deltaMs: number;
}): TimelineEditResult & { deltaMs: number } => {
  const clipIds = new Set(expandLinkedClipIds(options.composition, options.selection.clipIds));
  const zoomIds = new Set(options.selection.zoomIds);
  const selectedStarts = [
    ...options.composition.clips.filter((clip) => clipIds.has(clip.id)).map((clip) => clip.timelineStartMs),
    ...options.zoomElements.filter((zoom) => zoomIds.has(zoom.id)).map((zoom) => zoom.startMs),
  ];
  if (!selectedStarts.length || !Number.isFinite(options.deltaMs))
    return {
      composition: options.composition,
      zoomElements: [...options.zoomElements],
      rippleRange: null,
      deltaMs: 0,
    };
  const requestedDelta = Math.round(options.deltaMs);
  const minimumStart = Math.min(...selectedStarts);
  const visualBounds = visualMoveDeltaBounds(options.composition.clips, clipIds);
  const deltaMs = Math.max(-minimumStart, visualBounds.min, Math.min(visualBounds.max, requestedDelta));
  const composition: ClipComposition = {
    ...clone(options.composition),
    clips: options.composition.clips.map((clip) =>
      clipIds.has(clip.id) ? { ...clone(clip), timelineStartMs: clip.timelineStartMs + deltaMs } : clone(clip),
    ),
  };
  return {
    composition,
    zoomElements: options.zoomElements.map((zoom) =>
      zoomIds.has(zoom.id)
        ? { ...clone(zoom), startMs: zoom.startMs + deltaMs, endMs: zoom.endMs + deltaMs }
        : clone(zoom),
    ),
    rippleRange: null,
    deltaMs,
  };
};
