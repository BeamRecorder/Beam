import type { AppliedZoom, ZoomFocus } from './zoom-types';
import type { CameraSimulationState, CompositionCameraInputs } from './composition-camera-types';
import { createAutoFollowState, updateAutoFollowTarget } from './auto-follow-camera';
import { clampFocusToScale, cursorFocusAt } from './zoom-playback';
import type { CursorTelemetryPoint } from '../capture/capture-session';

/** Preserve the acquired focus through a handoff, including checkpoint restores. */
export function connectedCameraFocus(
  state: CameraSimulationState,
  zoom: AppliedZoom,
  timeMs: number,
  inputs: CompositionCameraInputs,
  telemetry: readonly CursorTelemetryPoint[],
  zoomAt: (time: number) => AppliedZoom | null,
): ZoomFocus {
  const handoff = zoom.connection!;
  if (state.connection?.fromId !== handoff.from.id || state.connection.toId !== handoff.to.id) {
    const destination = { ...zoomAt(handoff.endMs)!, mode: handoff.to.mode };
    let to = destination.focus;
    if (handoff.to.mode === 'auto') {
      const cursorTime = inputs.mapTelemetryTime?.(handoff.endMs) ?? handoff.endMs;
      const rawCursor = cursorFocusAt(telemetry, cursorTime);
      const cursor = rawCursor ? (inputs.mapFocus?.(rawCursor, destination, handoff.endMs) ?? rawCursor) : null;
      to = updateAutoFollowTarget(
        createAutoFollowState(state.autoFollow.settings),
        cursor,
        to,
        destination.scale,
        1,
        handoff.endMs,
      );
    }
    state.connection = {
      fromId: handoff.from.id,
      toId: handoff.to.id,
      from:
        handoff.from.mode === 'auto' && state.autoFollow.initialized
          ? { ...state.autoFollow.target }
          : { cx: state.camera.focusX, cy: state.camera.focusY },
      to: { ...to },
    };
  }
  const { from, to } = state.connection;
  // Seed the incoming follow state with the acquired endpoint, rather than
  // resetting to the saved click focus on the first frame after the pan.
  Object.assign(state.autoFollow, {
    initialized: true,
    reachedFullZoom: true,
    lastTimeMs: timeMs,
    lockUntilMs: timeMs,
    target: to,
    frozenTarget: to,
    direction: { cx: 0, cy: 0 },
  });
  return clampFocusToScale(
    {
      cx: from.cx + (to.cx - from.cx) * handoff.progress,
      cy: from.cy + (to.cy - from.cy) * handoff.progress,
    },
    zoom.scale,
  );
}
