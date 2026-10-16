import type { CursorTelemetryPoint } from '../capture/capture-session';
import type { ZoomAction, ZoomShotBox } from './zoom-shot-types';

const CLICK_TYPES = new Set(['click', 'double-click', 'right-click', 'middle-click']);
export const mergeActionBox = (a: ZoomShotBox, b: ZoomShotBox): ZoomShotBox => ({
  left: Math.min(a.left, b.left),
  top: Math.min(a.top, b.top),
  right: Math.max(a.right, b.right),
  bottom: Math.max(a.bottom, b.bottom),
});
const boxFor = (point: CursorTelemetryPoint): ZoomShotBox => ({
  left: point.cx,
  right: point.cx,
  top: point.cy,
  bottom: point.cy,
});

/** A visible press owns its full gesture, including its last observed position before release. */
export function recordingZoomActions(points: readonly CursorTelemetryPoint[]): ZoomAction[] {
  const actions: ZoomAction[] = [];
  // Older telemetry folds/releases or omits them: movement alone cannot prove a held button.
  const recordsReleases = points.some((point) => point.interactionType === 'mouseup');
  let pending: ZoomAction | null = null;
  const finish = () => {
    if (pending) actions.push(pending);
    pending = null;
  };
  for (const point of points) {
    if (CLICK_TYPES.has(point.interactionType ?? '')) {
      finish();
      if (point.visible !== false) pending = { startMs: point.timeMs, endMs: point.timeMs, box: boxFor(point) };
    } else if (pending && recordsReleases) {
      pending.endMs = point.timeMs;
      // Hidden coordinates can be stale or belong to the compositor's hidden-pointer transport.
      if (point.visible !== false) pending.box = mergeActionBox(pending.box, boxFor(point));
      if (point.interactionType === 'mouseup') finish();
    }
  }
  finish();
  return actions;
}
