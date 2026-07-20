import type { ZoomElement, ZoomFocus } from './zoom-types'

export interface AppliedZoom {
  scale: number
  focus: ZoomFocus
}

const ENTER_MS = 480
const EXIT_MS = 550
const easeOutCubic = (value: number) => 1 - (1 - value) ** 3
const easeInCubic = (value: number) => value ** 3

function phaseProgress(element: ZoomElement, timeMs: number) {
  const duration = element.endMs - element.startMs
  if (duration <= 0 || timeMs < element.startMs || timeMs > element.endMs) return 0
  const speed = Math.min(2, Math.max(0.5, element.speed))
  const entrance = Math.min(ENTER_MS / speed, duration / 2)
  const exit = Math.min(EXIT_MS / speed, duration / 2)
  if (timeMs < element.startMs + entrance) return easeOutCubic((timeMs - element.startMs) / entrance)
  if (timeMs > element.endMs - exit) return easeInCubic((element.endMs - timeMs) / exit)
  return 1
}

function focusAtTime(element: ZoomElement, timeMs: number): ZoomFocus {
  const keyframes = element.focusKeyframes
  if (keyframes.length === 0 || timeMs <= keyframes[0].timeMs) return element.focus
  const nextIndex = keyframes.findIndex((keyframe) => keyframe.timeMs > timeMs)
  if (nextIndex === -1) return keyframes.at(-1) ?? element.focus
  const previous = keyframes[nextIndex - 1]
  const next = keyframes[nextIndex]
  const ratio = (timeMs - previous.timeMs) / Math.max(1, next.timeMs - previous.timeMs)
  return { cx: previous.cx + (next.cx - previous.cx) * ratio, cy: previous.cy + (next.cy - previous.cy) * ratio }
}

export function zoomAtTime(elements: ZoomElement[], timeMs: number): AppliedZoom | null {
  const active = elements.filter((element) => timeMs >= element.startMs && timeMs <= element.endMs)
  if (active.length === 0) return null
  const weighted = active.map((element) => ({ element, progress: phaseProgress(element, timeMs) }))
  const totalWeight = weighted.reduce((total, entry) => total + entry.progress, 0)
  if (totalWeight <= 0) return { scale: 1, focus: focusAtTime(weighted[0].element, timeMs) }
  const focus = weighted.reduce((total, entry) => {
    const point = focusAtTime(entry.element, timeMs)
    return { cx: total.cx + point.cx * entry.progress, cy: total.cy + point.cy * entry.progress }
  }, { cx: 0, cy: 0 })
  const scale = weighted.reduce((total, entry) => total + (entry.element.scale - 1) * entry.progress, 0) / totalWeight
  return { scale: 1 + scale, focus: { cx: focus.cx / totalWeight, cy: focus.cy / totalWeight } }
}
