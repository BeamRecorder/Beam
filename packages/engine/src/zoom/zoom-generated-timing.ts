import type { ZoomElement } from './zoom-types';
import { createZoomTiming } from './zoom-timing';

/** Expose the planner's anticipatory ramps in the timeline, sharing boundaries between connected shots. */
export function boundGeneratedZooms(holds: readonly ZoomElement[], durationMs: number): ZoomElement[] {
  const spans = holds.map((zoom) => {
    const timing = createZoomTiming(zoom.depth);
    return {
      startMs: Math.max(0, Math.floor(zoom.startMs - timing.entryMs)),
      endMs: Math.min(durationMs, Math.ceil(zoom.endMs + timing.exitMs)),
    };
  });
  for (let index = 1; index < holds.length; index++) {
    const previous = spans[index - 1]!,
      current = spans[index]!;
    if (previous.endMs <= current.startMs) continue;
    const boundary = Math.round((holds[index - 1]!.endMs + holds[index]!.startMs) / 2);
    previous.endMs = boundary;
    current.startMs = boundary;
  }
  return holds.map((zoom, index) => ({
    ...zoom,
    ...spans[index]!,
    timing: {
      version: 1,
      entryMs: Math.max(0, zoom.startMs - spans[index]!.startMs),
      exitMs: Math.max(0, spans[index]!.endMs - zoom.endMs),
    },
  }));
}
