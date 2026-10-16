import type { CursorTelemetryPoint } from '../capture/capture-session';
import type { CameraFollowCursor, CameraFollowGate, CompositionCameraInputs } from './composition-camera-types';
import { cameraSpringOmega } from './auto-follow-camera';
import { DEFAULT_ZOOM_AUTO_FOLLOW, normalizeZoomAutoFollow } from './zoom-types';

/** Partial compensation for the spring's lag, using actual future samples only. */
export const cameraFollowLeadMs = (responsiveness: number) => Math.min(200, 2000 / cameraSpringOmega(responsiveness));

const indexAfter = (points: readonly Pick<CursorTelemetryPoint, 'timeMs'>[], timeMs: number) => {
  let low = 0,
    high = points.length;
  while (low < high) {
    const middle = (low + high) >>> 1;
    if (points[middle]!.timeMs <= timeMs) low = middle + 1;
    else high = middle;
  }
  return low;
};

// Hidden samples can contain sentinel coordinates. Never interpolate toward
// them, or anticipate through a hidden interval into the next visible gesture.
const visibleFocusAt = (points: readonly CursorTelemetryPoint[], timeMs: number) => {
  const after = indexAfter(points, timeMs);
  const previous = points[Math.max(0, after - 1)];
  if (!previous || previous.visible === false) return null;
  const next = points[after];
  const mix =
    next && next.visible !== false && next.timeMs > previous.timeMs
      ? Math.max(0, Math.min(1, (timeMs - previous.timeMs) / (next.timeMs - previous.timeMs)))
      : 0;
  return {
    cx: previous.cx + ((next?.cx ?? previous.cx) - previous.cx) * mix,
    cy: previous.cy + ((next?.cy ?? previous.cy) - previous.cy) * mix,
  };
};

export function createCameraFollowCursor(
  inputs: CompositionCameraInputs,
  telemetry: readonly CursorTelemetryPoint[],
  canFollow: CameraFollowGate,
): CameraFollowCursor {
  const leadMs = cameraFollowLeadMs(
    normalizeZoomAutoFollow(inputs.autoFollow ?? DEFAULT_ZOOM_AUTO_FOLLOW).responsiveness,
  );
  const ends = new Map(inputs.zooms.map((zoom) => [zoom.id, zoom.endMs]));
  const hidden = telemetry.flatMap((point, index) =>
    point.visible === false
      ? [{ timeMs: point.timeMs, previousTimeMs: telemetry[index - 1]?.timeMs ?? point.timeMs }]
      : [],
  );
  return (zoom, timeMs) => {
    const sourceTime = inputs.mapTelemetryTime?.(timeMs) ?? timeMs;
    if (!canFollow(zoom.elementId, sourceTime)) return null;
    const current = visibleFocusAt(telemetry, sourceTime);
    if (!current) return null;
    const clipEnd = inputs.followEndMsAt?.(timeMs);
    const futureTime = Math.max(
      timeMs,
      Math.min(
        timeMs + leadMs,
        zoom.elementId ? (ends.get(zoom.elementId) ?? Infinity) : Infinity,
        // Screen intervals are half-open: sampling exactly at the end may
        // resolve the next clip and an unrelated recording clock.
        clipEnd === undefined ? Infinity : clipEnd - 0.001,
      ),
    );
    let futureSource = Math.max(sourceTime, inputs.mapTelemetryTime?.(futureTime) ?? futureTime);
    const hiddenPoint = hidden[indexAfter(hidden, sourceTime)];
    if (hiddenPoint && hiddenPoint.timeMs <= futureSource) {
      futureSource = Math.max(sourceTime, hiddenPoint.previousTimeMs);
    }
    const predicted = visibleFocusAt(telemetry, futureSource) ?? current;
    // Predict the cursor, not the clip's transform or scene animation.
    return inputs.mapFocus?.(predicted, zoom, timeMs) ?? predicted;
  };
}
