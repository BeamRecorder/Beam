import { splitClip, CompositionEngineError } from '../commands/clip-engine';
import { clipEndMs, type ClipComposition } from '../shared/composition-types';
import type { ZoomElement } from '../zoom/zoom-types';
import type { TimelineEditResult } from './timeline-edit-types';
import { automaticZoomOwner } from './recording-sidecars';
import { selectionHasLocks } from './timeline-locks';

/** Cut automatically linked zoom regions with their screen; each half follows its own recording fragment. */
export function splitRecordingClip(
  composition: ClipComposition,
  zoomElements: readonly ZoomElement[],
  clipId: string,
  timeMs: number,
  idFactory: () => string = () => crypto.randomUUID(),
): TimelineEditResult {
  const source = composition.clips.find((clip) => clip.id === clipId);
  if (!source) throw new CompositionEngineError(`Unknown clip: ${clipId}`);
  const owners = new Map(zoomElements.map((zoom) => [zoom.id, automaticZoomOwner(composition, zoom)]));
  const associated = zoomElements.filter((zoom) => {
    const owner = owners.get(zoom.id);
    return owner && (owner.id === source.id || Boolean(source.groupId && owner.groupId === source.groupId));
  });
  if (selectionHasLocks(composition, zoomElements, { clipIds: [clipId], zoomIds: associated.map((zoom) => zoom.id) }))
    return { composition, zoomElements: [...zoomElements], rippleRange: null };
  const target = Math.round(timeMs);
  const next = splitClip(composition, clipId, target, idFactory);
  const previousIds = new Set(composition.clips.map((clip) => clip.id));
  const rightScreens = next.clips.filter(
    (clip) => clip.kind === 'screen' && !previousIds.has(clip.id) && clip.timelineStartMs === target,
  );
  const ids = new Set([...next.clips.map((clip) => clip.id), ...zoomElements.map((zoom) => zoom.id)]);
  const elements = zoomElements.flatMap((zoom) => {
    const owner = owners.get(zoom.id);
    const right =
      owner &&
      rightScreens.find(
        (clip) =>
          clip.kind === 'screen' &&
          clip.assetId === owner.assetId &&
          clip.trackId === owner.trackId &&
          target > owner.timelineStartMs &&
          target < clipEndMs(owner),
      );
    if (!right || !owner) return [zoom];
    if (zoom.endMs <= target) return [{ ...zoom, linkedClipId: owner.id }];
    if (zoom.startMs >= target) return [{ ...zoom, linkedClipId: right.id }];
    const id = idFactory();
    if (!id || ids.has(id)) throw new CompositionEngineError('Duplicate zoom fragment id.');
    ids.add(id);
    return [
      { ...zoom, splitGroupId: zoom.splitGroupId ?? zoom.id, linkedClipId: owner.id, endMs: target },
      { ...zoom, splitGroupId: zoom.splitGroupId ?? zoom.id, id, linkedClipId: right.id, startMs: target },
    ];
  });
  return { composition: next, zoomElements: elements, rippleRange: null };
}
