import type { ZoomElement } from './zoom-types';
import { ZOOM_DEPTH_SCALES } from './zoom-types';

export const CONNECTED_GAP_MS = 1350;
export const CONNECTED_PAN_MS = 1000;

/** Perceived zoom distance is logarithmic; deeper moves need more screen time. */
export const cinematicZoomDurationMs = (scale: number) => 600 + 550 * Math.log(Math.max(1, scale));
export const interpolateZoomScale = (from: number, to: number, progress: number) =>
  progress <= 0 ? from : progress >= 1 ? to : from * (to / from) ** progress;

/** Zero velocity and acceleration at both ends; logarithmic scale retains perceived speed. */
export function cinematicProgress(progress: number): number {
  const t = Math.min(1, Math.max(0, progress));
  return t * t * t * (10 + t * (-15 + 6 * t));
}

export function cinematicZoomStrength(zoom: ZoomElement, timeMs: number): number {
  const duration = cinematicZoomDurationMs(ZOOM_DEPTH_SCALES[zoom.depth]);
  const progress =
    timeMs < zoom.startMs ? 1 - (zoom.startMs - timeMs) / duration : 1 - (timeMs - zoom.endMs) / duration;
  if (progress <= 0) return 0;
  if (progress >= 1) return 1;
  return cinematicProgress(progress);
}
