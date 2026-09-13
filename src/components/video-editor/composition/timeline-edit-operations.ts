import { preservesLockedItems, selectionHasLocks } from './timeline-locks';
import type { ClipComposition } from '~/media/shared/composition-types';
import type { ZoomElement } from '../zoom/zoom-types';
import { deleteClip } from './engine/clip-engine';
import { validateComposition } from './engine/clip-composition-validation';
import { prepareTimelineSelectionMove } from './timeline-selection-move';
export { expandLinkedClipIds } from './timeline-selection-move';
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
  const unchanged = { composition: options.composition, zoomElements: [...options.zoomElements], rippleRange: null };
  if (selectionHasLocks(options.composition, options.zoomElements, options.selection)) return unchanged;
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
  if (
    !preservesLockedItems(options.composition.clips, composition.clips) ||
    !preservesLockedItems(options.zoomElements, zoomElements)
  )
    return unchanged;
  return { composition, zoomElements, rippleRange };
};

export const shiftTimelineSelection = (options: {
  composition: ClipComposition;
  zoomElements: readonly ZoomElement[];
  selection: TimelineSelectionIds;
  deltaMs: number;
}): TimelineEditResult & { deltaMs: number } => prepareTimelineSelectionMove(options)(options.deltaMs);
