import { ZOOM_DEPTH_SCALES, type ZoomElement } from './zoom-types';
import { cinematicZoomDurationMs, CONNECTED_GAP_MS, CONNECTED_PAN_MS } from './zoom-transitions';

/** Overlapping ramps must share a pan instead of competing for camera dominance. */
export function cinematicConnectionWindow(current: ZoomElement, next: ZoomElement) {
  const gap = next.startMs - current.endMs;
  const rampSpan =
    cinematicZoomDurationMs(ZOOM_DEPTH_SCALES[current.depth]) + cinematicZoomDurationMs(ZOOM_DEPTH_SCALES[next.depth]);
  if (
    current.transition !== 'cinematic' ||
    next.transition !== 'cinematic' ||
    gap < 0 ||
    gap > Math.max(CONNECTED_GAP_MS, rampSpan)
  )
    return null;
  const extension = Math.max(0, (CONNECTED_PAN_MS - gap) / 2);
  const startMs = Math.max((current.startMs + current.endMs) / 2, current.endMs - extension);
  const endMs = Math.min((next.startMs + next.endMs) / 2, next.startMs + extension);
  return endMs > startMs ? { startMs, endMs } : null;
}
