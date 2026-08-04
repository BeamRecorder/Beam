import type { CursorTelemetryPoint } from '../../../api/types/capture-session'
import { ZOOM_DEPTH_SCALES, type ZoomElement, type ZoomFocus } from './zoom-types'

export interface AppliedZoom {
  scale: number
  focus: ZoomFocus
  strength: number
  mode: ZoomElement['mode']
}
export const ZOOM_IN_MS = 1522.575
export const ZOOM_OUT_MS = 1015.05
const LEAD_MS = 200
const IN_OVERLAP_MS = 1000
const OUT_EARLY_MS = 500
const CONNECTED_GAP_MS = 1350
const CONNECTED_PAN_MS = 1000
const CURSOR_SMOOTHING_MS = 180
const CURSOR_HISTORY_MS = 600
const clamp01 = (value: number) => Math.min(1, Math.max(0, value))
const easeOut = (value: number) => 1 - (1 - clamp01(value)) ** 3
const lerp = (a: number, b: number, t: number) => a + (b - a) * t

export function clampFocusToScale(focus: ZoomFocus, scale: number): ZoomFocus {
  const margin = 1 / (2 * Math.max(1, scale))
  return { cx: Math.min(1 - margin, Math.max(margin, focus.cx)), cy: Math.min(1 - margin, Math.max(margin, focus.cy)) }
}

export function regionStrength(region: ZoomElement, timeMs: number): number {
  const adjusted = timeMs - LEAD_MS
  const inStart = region.startMs + IN_OVERLAP_MS - ZOOM_IN_MS
  let inEnd = inStart + ZOOM_IN_MS
  let outStart = region.endMs - OUT_EARLY_MS
  if (inEnd > outStart) {
    const midpoint = (inEnd + outStart) / 2
    inEnd = midpoint
    outStart = midpoint
  }
  if (adjusted < inStart || adjusted > outStart + ZOOM_OUT_MS) return 0
  if (adjusted < inEnd) return easeOut((adjusted - inStart) / Math.max(1, inEnd - inStart))
  if (adjusted <= outStart) return 1
  return 1 - easeOut((adjusted - outStart) / ZOOM_OUT_MS)
}

export function cursorFocusAt(samples: CursorTelemetryPoint[], timeMs: number): ZoomFocus | null {
  const next = samples.find((sample) => sample.timeMs > timeMs)
  const previous = [...samples].reverse().find((sample) => sample.timeMs <= timeMs)
  if (!previous) return next ? { cx: next.cx, cy: next.cy } : null
  if (!next) return { cx: previous.cx, cy: previous.cy }
  const t = (timeMs - previous.timeMs) / Math.max(1, next.timeMs - previous.timeMs)
  return { cx: lerp(previous.cx, next.cx, t), cy: lerp(previous.cy, next.cy, t) }
}

/** Smooths recorded cursor samples so a fast cross-screen movement pans the camera instead of snapping it. */
export function smoothedCursorFocusAt(samples: CursorTelemetryPoint[], timeMs: number): ZoomFocus | null {
  const current = cursorFocusAt(samples, timeMs)
  if (!current) return null
  let totalWeight = 1
  let weightedX = current.cx
  let weightedY = current.cy
  for (let index = samples.length - 1; index >= 0; index -= 1) {
    const sample = samples[index]
    if (sample.timeMs >= timeMs) continue
    const ageMs = timeMs - sample.timeMs
    if (ageMs > CURSOR_HISTORY_MS) break
    const weight = Math.exp(-ageMs / CURSOR_SMOOTHING_MS)
    totalWeight += weight
    weightedX += sample.cx * weight
    weightedY += sample.cy * weight
  }
  return { cx: weightedX / totalWeight, cy: weightedY / totalWeight }
}

export function zoomAtTime(
  elements: ZoomElement[],
  timeMs: number,
  telemetry: CursorTelemetryPoint[] = [],
): AppliedZoom | null {
  const pair = [...elements]
    .sort((left, right) => left.startMs - right.startMs)
    .find((current, index, sorted) => {
      const next = sorted[index + 1]
      return (
        next &&
        next.startMs - current.endMs <= CONNECTED_GAP_MS &&
        timeMs >= current.endMs + LEAD_MS &&
        timeMs <= current.endMs + LEAD_MS + CONNECTED_PAN_MS
      )
    })
  if (pair) {
    const next = [...elements]
      .sort((left, right) => left.startMs - right.startMs)
      .find((candidate) => candidate.startMs >= pair.endMs && candidate.startMs - pair.endMs <= CONNECTED_GAP_MS)
    if (next) {
      const t = easeOut((timeMs - pair.endMs - LEAD_MS) / CONNECTED_PAN_MS)
      const startScale = ZOOM_DEPTH_SCALES[pair.depth]
      const endScale = ZOOM_DEPTH_SCALES[next.depth]
      const startFocus = clampFocusToScale(pair.focus, startScale)
      const endFocus = clampFocusToScale(next.focus, endScale)
      return {
        scale: lerp(startScale, endScale, t),
        focus: { cx: lerp(startFocus.cx, endFocus.cx, t), cy: lerp(startFocus.cy, endFocus.cy, t) },
        strength: 1,
        mode: 'auto',
      }
    }
  }
  const active = elements
    .map((element) => ({ element, strength: regionStrength(element, timeMs) }))
    .filter((entry) => entry.strength > 0)
    .sort((a, b) => b.strength - a.strength || b.element.startMs - a.element.startMs)
  if (active.length === 0) return null
  const current = active[0]
  const currentScale = ZOOM_DEPTH_SCALES[current.element.depth]
  const next = elements
    .filter(
      (candidate) =>
        candidate.startMs >= current.element.endMs && candidate.startMs - current.element.endMs <= CONNECTED_GAP_MS,
    )
    .sort((a, b) => a.startMs - b.startMs)[0]
  let focus = clampFocusToScale(current.element.focus, currentScale)
  let scale = currentScale
  if (
    next &&
    timeMs >= current.element.endMs + LEAD_MS &&
    timeMs <= current.element.endMs + LEAD_MS + CONNECTED_PAN_MS
  ) {
    const t = easeOut((timeMs - current.element.endMs - LEAD_MS) / CONNECTED_PAN_MS)
    const nextScale = ZOOM_DEPTH_SCALES[next.depth]
    focus = {
      cx: lerp(focus.cx, clampFocusToScale(next.focus, nextScale).cx, t),
      cy: lerp(focus.cy, clampFocusToScale(next.focus, nextScale).cy, t),
    }
    scale = lerp(scale, nextScale, t)
  } else if (current.element.mode === 'auto') {
    const cursor = smoothedCursorFocusAt(telemetry, timeMs)
    if (cursor) focus = clampFocusToScale(cursor, scale)
  }
  return { scale: 1 + (scale - 1) * current.strength, focus, strength: current.strength, mode: current.element.mode }
}
