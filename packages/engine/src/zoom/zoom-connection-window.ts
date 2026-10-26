import { ZOOM_DEPTH_SCALES, type ZoomElement } from './zoom-types';
import { cinematicZoomDurationMs, CONNECTED_GAP_MS, CONNECTED_PAN_MS } from './zoom-transitions';
import { zoomHoldWindow } from './zoom-timing';

/** Overlapping ramps must share a pan instead of competing for camera dominance. */
export function cinematicConnectionWindow(current: ZoomElement, next: ZoomElement) {
  if (Boolean(current.timing) !== Boolean(next.timing)) return null;
  if (current.timing && next.startMs > current.endMs) return null;
  const from = zoomHoldWindow(current),
    to = zoomHoldWindow(next);
  const gap = to.startMs - from.endMs;
  const rampSpan =
    cinematicZoomDurationMs(ZOOM_DEPTH_SCALES[current.depth]) + cinematicZoomDurationMs(ZOOM_DEPTH_SCALES[next.depth]);
  if (
    (!current.timing && current.transition !== 'cinematic') ||
    (!next.timing && next.transition !== 'cinematic') ||
    gap < 0 ||
    gap > Math.max(CONNECTED_GAP_MS, rampSpan)
  )
    return null;
  const extension = Math.max(0, (CONNECTED_PAN_MS - gap) / 2);
  const startMs = Math.max((from.startMs + from.endMs) / 2, from.endMs - extension);
  const endMs = Math.min((to.startMs + to.endMs) / 2, to.startMs + extension);
  return endMs > startMs ? { startMs, endMs } : null;
}
