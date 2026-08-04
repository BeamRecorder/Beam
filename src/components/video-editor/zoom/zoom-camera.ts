import type { ZoomFocus } from './zoom-types'
import { clampFocusToScale } from './zoom-playback'

export interface CursorFollowCameraState {
  initialized: boolean
  reachedFullZoom: boolean
  lastTimeMs: number
  focus: ZoomFocus
  frozenFocus: ZoomFocus
}

export const createCursorFollowCameraState = (): CursorFollowCameraState => ({
  initialized: false,
  reachedFullZoom: false,
  lastTimeMs: 0,
  focus: { cx: 0.5, cy: 0.5 },
  frozenFocus: { cx: 0.5, cy: 0.5 },
})

const FOLLOW_RESPONSE_MS = 180
const lerp = (from: number, to: number, amount: number) => from + (to - from) * amount

export function updateCursorFollowCamera(
  state: CursorFollowCameraState,
  cursor: ZoomFocus | null,
  regionFocus: ZoomFocus,
  scale: number,
  strength: number,
  timeMs = state.lastTimeMs + 16,
): ZoomFocus {
  const fallback = clampFocusToScale(regionFocus, scale)
  if (strength < 0.01 || (state.initialized && timeMs + 0.5 < state.lastTimeMs)) {
    state.initialized = false
    state.reachedFullZoom = false
    state.lastTimeMs = timeMs
    return fallback
  }
  const elapsedMs = state.initialized ? Math.min(64, Math.max(0, timeMs - state.lastTimeMs)) : 0
  state.lastTimeMs = timeMs
  if (strength >= 0.99) state.reachedFullZoom = true
  if (state.reachedFullZoom && strength < 0.99) return state.frozenFocus
  if (!cursor) return state.initialized ? state.focus : fallback
  if (!state.initialized) {
    state.focus = fallback
    state.initialized = true
  }
  const half = 1 / (2 * Math.max(1, scale))
  const inset = half * 2 * 0.25
  const next = {
    cx:
      cursor.cx < state.focus.cx - half + inset || cursor.cx > state.focus.cx + half - inset
        ? cursor.cx
        : state.focus.cx,
    cy:
      cursor.cy < state.focus.cy - half + inset || cursor.cy > state.focus.cy + half - inset
        ? cursor.cy
        : state.focus.cy,
  }
  const target = clampFocusToScale(next, scale)
  const response = 1 - Math.exp(-elapsedMs / FOLLOW_RESPONSE_MS)
  state.focus = clampFocusToScale(
    { cx: lerp(state.focus.cx, target.cx, response), cy: lerp(state.focus.cy, target.cy, response) },
    scale,
  )
  state.frozenFocus = state.focus
  return state.focus
}
