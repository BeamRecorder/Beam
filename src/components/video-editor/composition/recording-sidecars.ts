import { recordingLinkedClipIds, recordingMediaOwner } from './recording-media-links';
import { clipEndMs, type ClipComposition, type VisualClip } from '~/media/shared/composition-types';
import type { ZoomElement } from '../zoom/zoom-types';
import type { TimelineSelectionIds } from './timeline-edit-types';
import type { RecordingSidecarUnlink } from './recording-sidecar-types';
import { preservesLockedItems } from './timeline-locks';

const contains = (clip: VisualClip, timeMs: number) => timeMs >= clip.timelineStartMs && timeMs < clipEndMs(clip);
export const automaticZoomOwner = (composition: ClipComposition, zoom: ZoomElement): VisualClip | null => {
  if (zoom.mode !== 'auto' || zoom.linkedClipId === null) return null;
  const assets = new Map(composition.assets.map((asset) => [asset.id, asset]));
  const screens = composition.clips.filter(
    (clip): clip is VisualClip => clip.kind === 'screen' && assets.get(clip.assetId)?.sessionId === zoom.sessionId,
  );
  const midpoint = (zoom.startMs + zoom.endMs) / 2;
  const explicit = zoom.linkedClipId ? screens.find((clip) => clip.id === zoom.linkedClipId) : null;
  if (explicit)
    return contains(explicit, midpoint)
      ? explicit
      : (screens.find((clip) => clip.assetId === explicit.assetId && contains(clip, midpoint)) ?? explicit);
  if (zoom.linkedClipId) return null;
  return (
    screens.find((clip) => contains(clip, midpoint)) ??
    screens.find((clip) => midpoint >= clip.sourceInMs && midpoint < clip.sourceInMs + clip.sourceDurationMs) ??
    (screens.length === 1 ? screens[0]! : null)
  );
};

export const recordingMoveSelection = (
  composition: ClipComposition,
  zooms: readonly ZoomElement[],
  selection: TimelineSelectionIds,
): TimelineSelectionIds => {
  const clipIds = new Set(recordingLinkedClipIds(composition, selection.clipIds));
  const zoomIds = new Set(selection.zoomIds);
  for (const zoom of zooms) {
    const owner = automaticZoomOwner(composition, zoom);
    if (owner && clipIds.has(owner.id)) zoomIds.add(zoom.id);
  }
  return { clipIds: [...clipIds], zoomIds: [...zoomIds] };
};

export const recordingSidecars = (composition: ClipComposition, zooms: readonly ZoomElement[], clipId: string) => {
  const linkedIds = new Set(recordingLinkedClipIds(composition, [clipId]));
  return {
    clips: composition.clips.filter((item) => item.id !== clipId && linkedIds.has(item.id)),
    zooms: zooms.filter((zoom) => automaticZoomOwner(composition, zoom)?.id === clipId),
  };
};

export const unlinkRecordingSidecars = (
  composition: ClipComposition,
  zooms: readonly ZoomElement[],
  request: RecordingSidecarUnlink,
) => {
  const sidecars = recordingSidecars(composition, zooms, request.clipId);
  const clipIds = new Set(sidecars.clips.filter((clip) => request.clipIds.includes(clip.id)).map((clip) => clip.id));
  const anchor = composition.clips.find((clip) => clip.id === request.clipId);
  const owner = anchor && recordingMediaOwner(composition, anchor);
  if (owner && clipIds.has(owner.id)) clipIds.add(request.clipId);
  const zoomIds = new Set(sidecars.zooms.filter((zoom) => request.zoomIds.includes(zoom.id)).map((zoom) => zoom.id));
  if (!clipIds.size && !zoomIds.size) return { composition, zoomElements: [...zooms] };
  const next = {
    ...composition,
    clips: composition.clips.map((clip) =>
      clipIds.has(clip.id) ? { ...clip, groupId: undefined, recordingClipId: null } : clip,
    ),
  };
  const elements = zooms.map((zoom) => (zoomIds.has(zoom.id) ? { ...zoom, linkedClipId: null } : zoom));
  if (
    composition.clips.find((clip) => clip.id === request.clipId)?.locked ||
    !preservesLockedItems(composition.clips, next.clips) ||
    !preservesLockedItems(zooms, elements)
  )
    return { composition, zoomElements: [...zooms] };
  return { composition: next, zoomElements: elements };
};
