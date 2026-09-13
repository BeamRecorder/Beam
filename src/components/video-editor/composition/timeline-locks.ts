import type { ClipComposition } from '~/media/shared/composition-types';
import type { ZoomElement } from '../zoom/zoom-types';
import type { LockableTimelineItem, TimelineLockRequest } from './timeline-lock-types';
import type { TimelineSelectionIds } from './timeline-edit-types';

const content = (item: LockableTimelineItem) => JSON.stringify({ ...item, locked: undefined, order: undefined });
export const preservesLockedItems = <T extends LockableTimelineItem>(before: readonly T[], after: readonly T[]) => {
  const locked = before.filter((item) => item.locked);
  if (!locked.length) return true;
  const next = new Map(after.map((item) => [item.id, item]));
  return locked.every((item) => {
    const replacement = next.get(item.id);
    if (!replacement || (replacement !== item && content(item) !== content(replacement))) return false;
    return before.every((other) => {
      const otherNext = next.get(other.id);
      if (
        !otherNext ||
        item.order === undefined ||
        replacement.order === undefined ||
        other.order === undefined ||
        otherNext.order === undefined
      )
        return true;
      return Math.sign(item.order - other.order) === Math.sign(replacement.order - otherNext.order);
    });
  });
};

export const lockedTimelineSelection = (
  composition: ClipComposition,
  zooms: readonly ZoomElement[],
  selection: TimelineSelectionIds,
): TimelineSelectionIds => {
  const ids = new Set(selection.clipIds);
  const groups = new Set(
    composition.clips.filter((clip) => ids.has(clip.id) && clip.groupId).map((clip) => clip.groupId),
  );
  const zoomIds = new Set(selection.zoomIds);
  return {
    clipIds: composition.clips
      .filter((clip) => clip.locked && (ids.has(clip.id) || (clip.groupId && groups.has(clip.groupId))))
      .map((clip) => clip.id),
    zoomIds: zooms.filter((zoom) => zoom.locked && zoomIds.has(zoom.id)).map((zoom) => zoom.id),
  };
};

export const selectionHasLocks = (
  composition: ClipComposition,
  zooms: readonly ZoomElement[],
  selection: TimelineSelectionIds,
) => {
  const locked = lockedTimelineSelection(composition, zooms, selection);
  return locked.clipIds.length > 0 || locked.zoomIds.length > 0;
};

export const preservesLockedAssets = (before: ClipComposition, after: ClipComposition) => {
  const assetIds = new Set(
    before.clips.filter((clip) => clip.locked).map((clip) => ('assetId' in clip ? clip.assetId : null)),
  );
  if (!assetIds.size) return true;
  const next = new Map(after.assets.map((asset) => [asset.id, asset]));
  return before.assets
    .filter((asset) => assetIds.has(asset.id))
    .every((asset) => {
      const replacement = next.get(asset.id);
      return (
        replacement === asset ||
        (replacement !== undefined &&
          JSON.stringify({ ...replacement, audioAnalyses: undefined }) ===
            JSON.stringify({ ...asset, audioAnalyses: undefined }))
      );
    });
};

export const setTimelineLocks = (
  composition: ClipComposition,
  zooms: readonly ZoomElement[],
  request: TimelineLockRequest,
) => {
  const clipIds = new Set(request.clipIds);
  const groups = new Set(
    composition.clips.filter((clip) => clipIds.has(clip.id) && clip.groupId).map((clip) => clip.groupId),
  );
  for (const clip of composition.clips) if (clip.groupId && groups.has(clip.groupId)) clipIds.add(clip.id);
  const zoomIds = new Set(request.zoomIds);
  return {
    composition: {
      ...composition,
      clips: composition.clips.map((clip) =>
        clipIds.has(clip.id) && Boolean(clip.locked) !== request.locked ? { ...clip, locked: request.locked } : clip,
      ),
    },
    zoomElements: zooms.map((zoom) =>
      zoomIds.has(zoom.id) && Boolean(zoom.locked) !== request.locked ? { ...zoom, locked: request.locked } : zoom,
    ),
  };
};

export class TimelineLockedError extends Error {}
