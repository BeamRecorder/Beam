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
});

const axisTarget = (cursor: number, focus: number, safeHalfExtent: number) =>
  Math.abs(cursor - focus) > safeHalfExtent ? cursor : focus;

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
    return fallback;
  }
  state.lastTimeMs = timeMs;
  if (!state.initialized) {
    state.initialized = true;
    state.target = fallback;
    state.frozenTarget = fallback;
  }
  if (!state.reachedFullZoom) {
    state.target = fallback;
    state.frozenTarget = fallback;
    if (strength < 0.99) return fallback;
    state.reachedFullZoom = true;
  }
  if (state.reachedFullZoom && strength < 0.99) return clampFocusToScale(state.frozenTarget, scale);
  if (!cursor) return state.target;
  const visibleHalfExtent = 1 / (2 * Math.max(1, scale));
  const nearEdge =
    Math.max(Math.abs(cursor.cx - state.target.cx), Math.abs(cursor.cy - state.target.cy)) > visibleHalfExtent * 0.9;
  const safeHalfExtent = visibleHalfExtent * state.settings.safeZone;
  const next = clampFocusToScale(
    {
      cx: axisTarget(cursor.cx, state.target.cx, safeHalfExtent),
      cy: axisTarget(cursor.cy, state.target.cy, safeHalfExtent),
    },
    scale,
  );
  // A lock prevents a reversal or a new axis while a pan settles. Continued
  // travel on its existing axis must remain responsive, even before settling.
  if (state.settings.directionLock && timeMs < state.lockUntilMs && !nearEdge) {
    for (const axis of ['cx', 'cy'] as const)
      if (Math.sign(next[axis] - state.target[axis]) !== Math.sign(state.direction[axis]))
        next[axis] = state.target[axis];
  }
  if (next.cx !== state.target.cx || next.cy !== state.target.cy) {
    state.direction = { cx: next.cx - state.target.cx, cy: next.cy - state.target.cy };
    state.target = next;
    if (state.settings.directionLock) state.lockUntilMs = timeMs + targetLockDurationMs(state.settings.responsiveness);
  }
  state.frozenTarget = state.target;
  return state.target;
}
