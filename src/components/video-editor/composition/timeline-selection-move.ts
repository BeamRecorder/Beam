import { recordingMediaOwner } from './recording-media-links';
import { automaticZoomOwner, recordingMoveSelection } from './recording-sidecars';
import { selectionHasLocks } from './timeline-locks';
import type { ClipComposition } from '~/media/shared/composition-types';
import { visualMoveDeltaBounds } from './engine/visual-track-layout';
import type { TimelineSelectionMoveSource, TimelineSelectionMoveResult } from './timeline-edit-types';

export const expandLinkedClipIds = (composition: ClipComposition, clipIds: readonly string[]): string[] => {
  const ids = new Set(clipIds);
  const groups = new Set(
    composition.clips.filter((clip) => ids.has(clip.id) && clip.groupId).map((clip) => clip.groupId),
  );
  for (const clip of composition.clips) if (clip.groupId && groups.has(clip.groupId)) ids.add(clip.id);
  return [...ids];
};

// Resolve selection and collision bounds once per gesture. Unchanged media and
// clips retain their identity so a drag does not invalidate every renderer.
export const prepareTimelineSelectionMove = (options: TimelineSelectionMoveSource) => {
  const selection = recordingMoveSelection(options.composition, options.zoomElements, options.selection);
  const clipIds = new Set(selection.clipIds);
  const zoomIds = new Set(selection.zoomIds);
  const owners = new Map(
    options.zoomElements.map((zoom) => [zoom.id, automaticZoomOwner(options.composition, zoom)?.id]),
  );
  const mediaOwners = new Map(
    options.composition.clips.map((clip) => [clip.id, recordingMediaOwner(options.composition, clip)?.id]),
  );
  const starts = [
    ...options.composition.clips.filter((clip) => clipIds.has(clip.id)).map((clip) => clip.timelineStartMs),
    ...options.zoomElements.filter((zoom) => zoomIds.has(zoom.id)).map((zoom) => zoom.startMs),
  ];
  const hasClips = options.composition.clips.some((clip) => clipIds.has(clip.id));
  const hasZooms = options.zoomElements.some((zoom) => zoomIds.has(zoom.id));
  const locked = selectionHasLocks(options.composition, options.zoomElements, selection);
  const minimumStart = starts.length ? Math.min(...starts) : 0;
  const bounds = visualMoveDeltaBounds(options.composition.clips, clipIds);
  const original: TimelineSelectionMoveResult = {
    composition: options.composition,
    zoomElements: [...options.zoomElements],
    rippleRange: null,
    deltaMs: 0,
  };
  let previous = original;
  return (requestedDelta: number): TimelineSelectionMoveResult => {
    const deltaMs =
      !locked && starts.length && Number.isFinite(requestedDelta)
        ? Math.max(-minimumStart, bounds.min, Math.min(bounds.max, Math.round(requestedDelta)))
        : 0;
    if (deltaMs === previous.deltaMs) return previous;
    if (deltaMs === 0) return (previous = original);
    previous = {
      composition: hasClips
        ? {
            ...options.composition,
            clips: options.composition.clips.map((clip) =>
              clipIds.has(clip.id)
                ? {
                    ...clip,
                    ...(mediaOwners.get(clip.id) ? { recordingClipId: mediaOwners.get(clip.id) } : {}),
                    timelineStartMs: clip.timelineStartMs + deltaMs,
                  }
                : clip,
            ),
          }
        : options.composition,
      zoomElements: hasZooms
        ? options.zoomElements.map((zoom) =>
            zoomIds.has(zoom.id)
              ? {
                  ...zoom,
                  ...(owners.get(zoom.id) ? { linkedClipId: owners.get(zoom.id) } : {}),
                  startMs: zoom.startMs + deltaMs,
                  endMs: zoom.endMs + deltaMs,
                }
              : zoom,
          )
        : original.zoomElements,
      rippleRange: null,
      deltaMs,
    };
    return previous;
  };
};
