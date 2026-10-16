import type { ClipComposition } from '../shared/composition-types';
import type { ZoomElement } from './zoom-types';
import { CONNECTED_GAP_MS } from './zoom-playback';
import { cinematicZoomDurationMs } from './zoom-transitions';
import { ZOOM_DEPTH_SCALES } from './zoom-types';
import { cinematicConnectionWindow } from './zoom-connection-window';

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
  const changedZooms = new Set<string>();
  let lead = CONNECTED_GAP_MS;
  const includeRamp = (zoom: ZoomElement | undefined) => {
    if (zoom?.transition === 'cinematic') lead = Math.max(lead, cinematicZoomDurationMs(ZOOM_DEPTH_SCALES[zoom.depth]));
  };
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
    if (old !== zoom) {
      changedZooms.add(zoom.id);
      start = Math.min(start, zoom.startMs, old?.startMs ?? Infinity);
      includeRamp(zoom);
      includeRamp(old);
    }
    zooms.delete(zoom.id);
  }
  for (const zoom of zooms.values()) {
    changedZooms.add(zoom.id);
    start = Math.min(start, zoom.startMs);
    includeRamp(zoom);
  }
  if (!changedZooms.size) return Math.max(0, start - lead);
  let connectionStart = Infinity;
  for (const elements of [previousZooms, nextZooms]) {
    const ordered = elements
      .filter((zoom) => zoom.enabled !== false && zoom.effect !== 'glass')
      .sort((a, b) => a.startMs - b.startMs);
    for (let index = 0; index < ordered.length - 1; index++) {
      const from = ordered[index]!,
        to = ordered[index + 1]!;
      if (changedZooms.has(from.id) || changedZooms.has(to.id)) {
        const handoffWindow = cinematicConnectionWindow(from, to);
        if (handoffWindow) connectionStart = Math.min(connectionStart, handoffWindow.startMs);
      }
    }
  }
  return Math.max(0, Math.min(start - lead, connectionStart));
}
