import { normalizeZoomAutoFollow, type ZoomAutoFollowSettings, type ZoomFocus } from '@beam/engine/zoom/zoom-types';
import { clampFocusToScale } from '@beam/engine/zoom/zoom-playback';

import type { AutoFollowState } from './auto-follow-camera-types';

export const cameraSpringOmega = (responsiveness: number) => 7 + Math.min(1, Math.max(0, responsiveness)) * 9;

const targetLockDurationMs = (responsiveness: number) => (4 / cameraSpringOmega(responsiveness)) * 1_000;

export const createAutoFollowState = (settings: ZoomAutoFollowSettings): AutoFollowState => ({
  settings: normalizeZoomAutoFollow(settings),
  initialized: false,
  reachedFullZoom: false,
  lastTimeMs: 0,
  lockUntilMs: 0,
  target: { cx: 0.5, cy: 0.5 },
  frozenTarget: { cx: 0.5, cy: 0.5 },
  direction: { cx: 0, cy: 0 },
  anchorCursor: { cx: 0.5, cy: 0.5 },
  anchorFocus: { cx: 0.5, cy: 0.5 },
  previousCursor: null,
  lastMotionTimeMs: 0,
  settled: false,
});

/** A quiet core and a C2 shoulder: crossing the safe zone never recenters in one step. */
export function progressiveFollowAxis(cursor: number, focus: number, safeHalfExtent: number): number {
  const distance = Math.abs(cursor - focus);
  const inner = safeHalfExtent * 0.25;
  if (distance <= inner) return focus;
  const shoulder = safeHalfExtent - inner;
  const progress = Math.min(1, (distance - inner) / shoulder);
  const offset =
    distance >= safeHalfExtent
      ? distance - (inner + safeHalfExtent) / 2
      : shoulder * (progress ** 3 - progress ** 4 / 2);
  return focus + Math.sign(cursor - focus) * offset;
}

export function progressiveFollowFocus(
  cursor: ZoomFocus,
  anchorCursor: ZoomFocus,
  anchorFocus: ZoomFocus,
  scale: number,
  safeZone: number,
): ZoomFocus {
  const half = safeZone / (2 * Math.max(1, scale));
  return clampFocusToScale(
    {
      cx: anchorFocus.cx + (progressiveFollowAxis(cursor.cx, anchorCursor.cx, half) - anchorCursor.cx),
      cy: anchorFocus.cy + (progressiveFollowAxis(cursor.cy, anchorCursor.cy, half) - anchorCursor.cy),
    },
    scale,
  );
}

export function updateAutoFollowTarget(
  state: AutoFollowState,
  cursor: ZoomFocus | null,
  regionFocus: ZoomFocus,
  scale: number,
  strength: number,
  timeMs: number,
): ZoomFocus {
  const fallback = clampFocusToScale(regionFocus, scale);
  if (strength < 0.01 || (state.initialized && timeMs + 0.5 < state.lastTimeMs)) {
    state.initialized = false;
    state.reachedFullZoom = false;
    state.lastTimeMs = timeMs;
    state.lockUntilMs = timeMs;
    state.target = fallback;
    state.frozenTarget = fallback;
    state.direction = { cx: 0, cy: 0 };
    state.previousCursor = null;
    return fallback;
  }
  const elapsedMs = Math.min(80, Math.max(0, timeMs - state.lastTimeMs));
  state.lastTimeMs = timeMs;
  if (!state.initialized) {
    state.initialized = true;
    state.target = fallback;
    state.frozenTarget = fallback;
    state.anchorCursor = { ...regionFocus };
    state.anchorFocus = { ...regionFocus };
    state.previousCursor = null;
    state.lastMotionTimeMs = timeMs;
    state.settled = false;
  }
  if (!state.reachedFullZoom) {
    state.target = fallback;
    state.frozenTarget = fallback;
    state.anchorCursor = { ...regionFocus };
    state.anchorFocus = { ...regionFocus };
    if (strength < 0.99) return fallback;
    state.reachedFullZoom = true;
  }
  if (state.reachedFullZoom && strength < 0.99) return clampFocusToScale(state.frozenTarget, scale);
  if (!cursor) {
    state.previousCursor = null;
    return state.target;
  }
  const previous = state.previousCursor;
  if (!previous || Math.max(Math.abs(cursor.cx - previous.cx), Math.abs(cursor.cy - previous.cy)) > 1e-10) {
    state.lastMotionTimeMs = timeMs;
    state.settled = false;
  } else if (!state.settled && timeMs - state.lastMotionTimeMs >= 120) {
    // Rebase once after a real pause. Later small movements stay quiet around
    // the acquired framing instead of pulling back toward the original click.
    state.anchorFocus = progressiveFollowFocus(
      cursor,
      state.anchorCursor,
      state.anchorFocus,
      scale,
      state.settings.safeZone,
    );
    state.anchorCursor = { ...cursor };
    state.settled = true;
  }
  state.previousCursor = { ...cursor };
  const visibleHalfExtent = 1 / (2 * Math.max(1, scale));
  const nearEdge =
    Math.max(Math.abs(cursor.cx - state.target.cx), Math.abs(cursor.cy - state.target.cy)) > visibleHalfExtent * 0.9;
  const next = progressiveFollowFocus(cursor, state.anchorCursor, state.anchorFocus, scale, state.settings.safeZone);
  const locked = state.settings.directionLock && timeMs < state.lockUntilMs && !nearEdge;
  for (const axis of ['cx', 'cy'] as const) {
    const delta = next[axis] - state.target[axis];
    const direction = Math.sign(delta);
    const reversing = direction * state.direction[axis] < 0;
    // Direction locking damps a turn; it never freezes an axis or jumps at a
    // deadline. The target itself is filtered before the camera spring sees it.
    const omega = cameraSpringOmega(state.settings.responsiveness) * (locked && reversing ? 1 : 2);
    next[axis] = state.target[axis] + delta * -Math.expm1((-omega * elapsedMs) / 1000);
    if ((!locked || state.direction[axis] === 0) && direction !== 0) {
      if (direction !== state.direction[axis])
        state.lockUntilMs = timeMs + targetLockDurationMs(state.settings.responsiveness);
      state.direction[axis] = direction;
    }
  }
  state.target = next;
  state.frozenTarget = state.target;
  return state.target;
}
