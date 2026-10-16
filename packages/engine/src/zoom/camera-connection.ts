import type { AppliedZoom, ZoomFocus } from './zoom-types';
import type { CameraSimulationState, CameraFollowCursor } from './composition-camera-types';
import { createAutoFollowState, progressiveFollowFocus } from './auto-follow-camera';
import { clampFocusToScale } from './zoom-playback';

/** Preserve the acquired focus through a handoff, including checkpoint restores. */
export function connectedCameraFocus(
  state: CameraSimulationState,
  zoom: AppliedZoom,
  timeMs: number,
  zoomAt: (time: number) => AppliedZoom | null,
  followCursorAt: CameraFollowCursor,
): ZoomFocus {
  const handoff = zoom.connection!;
  if (state.connection?.fromId !== handoff.from.id || state.connection.toId !== handoff.to.id) {
    const destination = { ...zoomAt(handoff.endMs)!, elementId: handoff.to.id, mode: handoff.to.mode };
    let to = destination.focus;
    const cursor = handoff.to.mode === 'auto' ? followCursorAt(destination, handoff.endMs) : null;
    if (cursor) to = progressiveFollowFocus(cursor, to, to, destination.scale, state.autoFollow.settings.safeZone);
    state.connection = {
      fromId: handoff.from.id,
      toId: handoff.to.id,
      from:
        handoff.from.mode === 'auto' && state.autoFollow.initialized
          ? { ...state.autoFollow.target }
          : { cx: state.camera.focusX, cy: state.camera.focusY },
      to: { ...to },
    };
    // The pan has already acquired this endpoint. Keep its spatial references
    // too, so the first hold frame cannot start a second correction.
    state.autoFollow = {
      ...createAutoFollowState(state.autoFollow.settings),
      initialized: true,
      reachedFullZoom: true,
      target: { ...to },
      frozenTarget: { ...to },
      anchorCursor: { ...(cursor ?? to) },
      anchorFocus: { ...to },
      previousCursor: cursor ? { ...cursor } : null,
      lastMotionTimeMs: handoff.endMs,
      settled: true,
    };
  }
  const { from, to } = state.connection;
  state.autoFollow.lastTimeMs = timeMs;
  state.autoFollow.lockUntilMs = timeMs;
  return clampFocusToScale(
    {
      cx: from.cx + (to.cx - from.cx) * handoff.progress,
      cy: from.cy + (to.cy - from.cy) * handoff.progress,
    },
    zoom.scale,
  );
}
