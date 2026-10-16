import type { CursorTelemetryPoint } from '../capture/capture-session';
import type { CameraFollowGate, CompositionCameraInputs } from './composition-camera-types';
import { ZOOM_DEPTH_SCALES } from './zoom-types';
import { cinematicZoomDurationMs } from './zoom-transitions';
import { ZOOM_IN_MS } from './zoom-playback';

const PRESS_TYPES = new Set(['click', 'double-click', 'right-click', 'middle-click']);

/** A generated shot first presents its action, then follows subsequent movement. */
export function createAutomaticFollowGate(
  inputs: CompositionCameraInputs,
  telemetry: readonly CursorTelemetryPoint[],
): CameraFollowGate {
  const presses = telemetry
    .filter((point) => point.visible !== false && PRESS_TYPES.has(point.interactionType ?? ''))
    .map((point) => point.timeMs)
    .sort((a, b) => a - b);
  const ordered = inputs.zooms
    .filter((zoom) => zoom.enabled !== false && zoom.effect !== 'glass')
    .sort((a, b) => a.startMs - b.startMs);
  const starts = new Map<string, number>();
  for (const [index, zoom] of ordered.entries()) {
    if (zoom.mode !== 'auto' || zoom.generation !== 'automatic') continue;
    const ramp = zoom.transition === 'cinematic' ? cinematicZoomDurationMs(ZOOM_DEPTH_SCALES[zoom.depth]) : ZOOM_IN_MS;
    // A previous hold owns its presses even when the next entry ramp overlaps it.
    // Flooring includes a press at the exact clip opening after rounded generation.
    const entry = Math.max(0, Math.floor(zoom.startMs - ramp), ordered[index - 1]?.endMs ?? 0);
    const from = inputs.mapTelemetryTime?.(entry) ?? entry;
    const until = inputs.mapTelemetryTime?.(zoom.endMs) ?? zoom.endMs;
    let low = 0,
      high = presses.length;
    while (low < high) {
      const middle = (low + high) >>> 1;
      if (presses[middle]! < from) low = middle + 1;
      else high = middle;
    }
    const first = presses[low];
    if (first !== undefined && first <= until) starts.set(zoom.id, first);
  }
  return (elementId, sourceTimeMs) => {
    const first = elementId === undefined ? undefined : starts.get(elementId);
    return first === undefined || sourceTimeMs >= first;
  };
}
