import type { ClipComposition } from '../shared/composition-types';
import type { ZoomElement } from './zoom-types';
import { CONNECTED_GAP_MS } from './zoom-playback';

/** Earliest target affected by an immutable edit, including connected zoom pans. */
export function cameraEditInvalidationTime(
  previous: ClipComposition,
  next: ClipComposition,
  previousZooms: readonly ZoomElement[],
  nextZooms: readonly ZoomElement[],
): number {
  if (previous.scene !== next.scene || previous.animations !== next.animations || previous.assets !== next.assets)
    return 0;
  let start = Infinity;
  const screens = new Map(previous.clips.filter((clip) => clip.kind === 'screen').map((clip) => [clip.id, clip]));
  for (const clip of next.clips) {
    if (clip.kind !== 'screen') continue;
    const old = screens.get(clip.id);
    if (old !== clip) start = Math.min(start, clip.timelineStartMs, old?.timelineStartMs ?? Infinity);
    screens.delete(clip.id);
  }
  for (const clip of screens.values()) start = Math.min(start, clip.timelineStartMs);
  const zooms = new Map(previousZooms.filter((zoom) => zoom.effect !== 'glass').map((zoom) => [zoom.id, zoom]));
  for (const zoom of nextZooms) {
    if (zoom.effect === 'glass') continue;
    const old = zooms.get(zoom.id);
    if (old !== zoom) start = Math.min(start, zoom.startMs, old?.startMs ?? Infinity);
    zooms.delete(zoom.id);
  }
  for (const zoom of zooms.values()) start = Math.min(start, zoom.startMs);
  return Math.max(0, start - CONNECTED_GAP_MS);
}
