import type { ZoomElement } from '../zoom/zoom-types';
import type { TimelineRange } from './timeline-edit-types';

export const rippleZooms = (zooms: readonly ZoomElement[], range: TimelineRange): ZoomElement[] => {
  const durationMs = range.endMs - range.startMs;
  return zooms.flatMap((zoom) => {
    if (zoom.endMs <= range.startMs) return [zoom];
    if (zoom.startMs >= range.endMs)
      return [{ ...zoom, startMs: zoom.startMs - durationMs, endMs: zoom.endMs - durationMs }];
    if (zoom.startMs >= range.startMs && zoom.endMs <= range.endMs) return [];
    const startMs = zoom.startMs < range.startMs ? zoom.startMs : range.startMs;
    const endMs = zoom.endMs - Math.min(durationMs, zoom.endMs - range.startMs);
    return endMs - startMs >= 200 ? [{ ...zoom, startMs, endMs }] : [];
  });
};
