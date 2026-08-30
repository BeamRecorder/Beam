import { normalizeZoomAutoFollow, type ZoomAutoFollowSettings, type ZoomFocus } from './zoom-types';
import { clampFocusToScale } from './zoom-playback';

export interface AutoFollowState {
  settings: ZoomAutoFollowSettings;
  initialized: boolean;
  reachedFullZoom: boolean;
  lastTimeMs: number;
  lockUntilMs: number;
  target: ZoomFocus;
  frozenTarget: ZoomFocus;
}

const FOLLOW_HYSTERESIS_RATIO = 0.05;

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
});

const axisTarget = (cursor: number, focus: number, safeHalfExtent: number, hysteresis: number) => {
  const minimum = focus - safeHalfExtent;
  const maximum = focus + safeHalfExtent;
  if (cursor < minimum) return cursor + safeHalfExtent - hysteresis;
  if (cursor > maximum) return cursor - safeHalfExtent + hysteresis;
  return focus;
};

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
  if (state.settings.directionLock && timeMs < state.lockUntilMs) return state.target;

  const visibleHalfExtent = 1 / (2 * Math.max(1, scale));
  const safeHalfExtent = visibleHalfExtent * state.settings.safeZone;
  const hysteresis = visibleHalfExtent * FOLLOW_HYSTERESIS_RATIO;
  const next = clampFocusToScale(
    {
      cx: axisTarget(cursor.cx, state.target.cx, safeHalfExtent, hysteresis),
      cy: axisTarget(cursor.cy, state.target.cy, safeHalfExtent, hysteresis),
    },
    scale,
  );
  if (next.cx !== state.target.cx || next.cy !== state.target.cy) {
    state.target = next;
    if (state.settings.directionLock) state.lockUntilMs = timeMs + targetLockDurationMs(state.settings.responsiveness);
  }
  state.frozenTarget = state.target;
  return state.target;
}
