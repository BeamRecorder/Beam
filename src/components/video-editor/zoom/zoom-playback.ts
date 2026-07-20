import type { ZoomElement, ZoomFocus } from './zoom-types'

export interface AppliedZoom {
  scale: number
  focus: ZoomFocus
}

const ENTER_MS = 480
const EXIT_MS = 550
const clamp = (value: number) => Math.min(1, Math.max(0, value))
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

export function zoomAtTime(elements: ZoomElement[], timeMs: number): AppliedZoom | null {
  const active = elements.find((element) => timeMs >= element.startMs && timeMs <= element.endMs)
  if (!active) return null
  const progress = phaseProgress(active, timeMs)
  return { scale: 1 + (active.scale - 1) * clamp(progress), focus: active.focus }
}
