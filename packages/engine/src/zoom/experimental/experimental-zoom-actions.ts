import type { CursorEvent } from '../../capture/capture-session';
import type { ExperimentalPoint } from './experimental-zoom-types';

/** Beam retains button identity in its journal; enrich only the experimental view of telemetry. */
export function experimentalTelemetry(
  points: readonly ExperimentalPoint[],
  events: readonly CursorEvent[] = [],
): ExperimentalPoint[] {
  const buttons = new Map<number, CursorEvent[]>();
  for (const event of events) {
    if (event.event !== 'button') continue;
    const time = Math.floor(event.sessionNs / 1_000_000);
    const list = buttons.get(time) ?? [];
    list.push(event);
    buttons.set(time, list);
  }
  return points.map((point) => {
    if (point.mouseButton || point.interactionType === 'move') return point;
    const pressed = point.interactionType !== 'mouseup';
    const candidates = buttons.get(point.timeMs);
    const index =
      candidates?.findIndex(
        (event) =>
          event.event === 'button' &&
          event.pressed === pressed &&
          Math.abs(event.normalizedX - point.cx) < 1e-6 &&
          Math.abs(event.normalizedY - point.cy) < 1e-6,
      ) ?? -1;
    const event = index >= 0 ? candidates!.splice(index, 1)[0] : undefined;
    return event?.event === 'button' ? { ...point, mouseButton: event.button } : point;
  });
}
