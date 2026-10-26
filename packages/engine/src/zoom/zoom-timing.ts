import type { ZoomDepth, ZoomElement } from './zoom-types';
import type { ZoomTiming } from './zoom-timing-types';
import { ZOOM_DEPTH_SCALES } from './zoom-types';
import { cinematicProgress, cinematicZoomDurationMs } from './zoom-transitions';

export function createZoomTiming(depth: ZoomDepth): ZoomTiming {
  const duration = cinematicZoomDurationMs(ZOOM_DEPTH_SCALES[depth]);
  return { version: 1, entryMs: duration, exitMs: duration };
}

/** Shortening an element compresses its ramps proportionally without extending its bounds. */
export function zoomHoldWindow(zoom: ZoomElement) {
  if (!zoom.timing) return { startMs: zoom.startMs, endMs: zoom.endMs };
  const duration = zoom.endMs - zoom.startMs;
  const ramps = zoom.timing.entryMs + zoom.timing.exitMs;
  const factor = ramps > duration ? duration / ramps : 1;
  return {
    startMs: zoom.startMs + zoom.timing.entryMs * factor,
    endMs: zoom.endMs - zoom.timing.exitMs * factor,
  };
}

export function boundedZoomStrength(zoom: ZoomElement, timeMs: number): number {
  if (timeMs <= zoom.startMs || timeMs >= zoom.endMs) return 0;
  const hold = zoomHoldWindow(zoom);
  if (timeMs < hold.startMs) return cinematicProgress((timeMs - zoom.startMs) / (hold.startMs - zoom.startMs));
  if (timeMs <= hold.endMs) return 1;
  return cinematicProgress((zoom.endMs - timeMs) / (zoom.endMs - hold.endMs));
}
