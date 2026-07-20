import type { CursorEvent, CursorMoveEvent } from '../../../api/types/capture-session'
import { DEFAULT_ZOOM_SCALE, DEFAULT_ZOOM_SPEED, type ZoomElement, type ZoomFocus, type ZoomFocusKeyframe } from './zoom-types'

export const CLICK_CLUSTER_GAP_MS = 650
export const CLICK_CLUSTER_DISTANCE = 0.07
export const DUPLICATE_CLICK_GAP_MS = 120
export const ZOOM_REGION_PADDING_MS = 900
export const ZOOM_ALGORITHM_VERSION = 3
const LEFT_MOUSE_BUTTON = 1

interface ClickPoint {
  timeMs: number
  focus: ZoomFocus
  focusKeyframes: ZoomFocusKeyframe[]
}

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value))
const eventTimeMs = (event: CursorEvent) => event.sessionNs / 1_000_000

function cursorPositionAt(events: CursorEvent[], timeMs: number): ZoomFocus | null {
  let latestMove: CursorMoveEvent | null = null
  for (const event of events) {
    if (event.event !== 'move' || eventTimeMs(event) > timeMs) continue
    latestMove = event
  }
  if (!latestMove || !latestMove.visible) return null
  return { cx: clamp(latestMove.normalizedX, 0, 1), cy: clamp(latestMove.normalizedY, 0, 1) }
}

function leftClickPoints(events: CursorEvent[]): ClickPoint[] {
  return events.flatMap((event) => {
    // Capture backends persist mouse buttons as 1=left, 2=right, 3=middle.
    if (event.event !== 'button' || event.button !== LEFT_MOUSE_BUTTON || !event.pressed) return []
    const focus = cursorPositionAt(events, eventTimeMs(event))
    if (!focus) return []
    const pressTimeMs = eventTimeMs(event)
    const release = events.find((candidate) =>
      candidate.event === 'button' && candidate.button === LEFT_MOUSE_BUTTON && !candidate.pressed && eventTimeMs(candidate) > pressTimeMs,
    )
    const moves = release
      ? events.filter((candidate): candidate is CursorMoveEvent =>
        candidate.event === 'move' && candidate.visible && eventTimeMs(candidate) >= pressTimeMs && eventTimeMs(candidate) <= eventTimeMs(release),
      )
      : []
    const lastMove = moves.at(-1)
    const isDrag = Boolean(lastMove && Math.hypot(lastMove.normalizedX - focus.cx, lastMove.normalizedY - focus.cy) > 0.015)
    const focusKeyframes = isDrag
      ? [{ timeMs: pressTimeMs, ...focus }, ...moves.map((move) => ({ timeMs: eventTimeMs(move), cx: clamp(move.normalizedX, 0, 1), cy: clamp(move.normalizedY, 0, 1) }))]
      : []
    return [{ timeMs: pressTimeMs, focus, focusKeyframes }]
  })
}

function clusterClicks(clicks: ClickPoint[]): ClickPoint[][] {
  const clusters: ClickPoint[][] = []
  for (const click of clicks) {
    const current = clusters.at(-1)
    const previous = current?.at(-1)
    const closeInTime = previous && click.timeMs - previous.timeMs <= CLICK_CLUSTER_GAP_MS
    const closeInSpace = previous && Math.hypot(click.focus.cx - previous.focus.cx, click.focus.cy - previous.focus.cy) <= CLICK_CLUSTER_DISTANCE
    if (current && closeInTime && closeInSpace) current.push(click)
    else clusters.push([click])
  }
  return clusters
}

function removeDuplicateClicks(clicks: ClickPoint[]): ClickPoint[] {
  return clicks.filter((click, index) => {
    const previous = clicks[index - 1]
    return !previous ||
      click.timeMs - previous.timeMs > DUPLICATE_CLICK_GAP_MS ||
      Math.hypot(click.focus.cx - previous.focus.cx, click.focus.cy - previous.focus.cy) > CLICK_CLUSTER_DISTANCE
  })
}

function focusForCluster(cluster: ClickPoint[]): ZoomFocus {
  const focus = cluster.reduce((total, click) => ({ cx: total.cx + click.focus.cx, cy: total.cy + click.focus.cy }), { cx: 0, cy: 0 })
  return { cx: focus.cx / cluster.length, cy: focus.cy / cluster.length }
}

function removeOverlappingWindows(elements: ZoomElement[]): ZoomElement[] {
  const sorted = [...elements].sort((left, right) => left.startMs - right.startMs)
  for (let index = 1; index < sorted.length; index += 1) {
    const previous = sorted[index - 1]
    const current = sorted[index]
    if (current.startMs >= previous.endMs) continue
    const boundary = Math.round((previous.endMs + current.startMs) / 2)
    previous.endMs = Math.max(previous.startMs + 1, boundary)
    current.startMs = Math.min(current.endMs - 1, boundary)
  }
  return sorted
}

export function buildAutomaticZoomElements(params: {
  events: CursorEvent[]
  sessionId: string
  durationMs: number
}): ZoomElement[] {
  const { events, sessionId, durationMs } = params
  if (durationMs <= 0) return []
  const elements = clusterClicks(removeDuplicateClicks(leftClickPoints(events)))
    .map<ZoomElement | null>((cluster) => {
      const first = cluster[0]
      const last = cluster.at(-1) ?? first
      const startMs = clamp(first.timeMs - ZOOM_REGION_PADDING_MS, 0, durationMs)
      const endMs = clamp(last.timeMs + ZOOM_REGION_PADDING_MS, 0, durationMs)
      if (endMs <= startMs) return null
      return {
        id: `auto:${sessionId}:${Math.round(first.timeMs)}`,
        sessionId,
        startMs: Math.round(startMs),
        endMs: Math.round(endMs),
        focus: focusForCluster(cluster),
        focusKeyframes: cluster.length === 1 ? cluster[0].focusKeyframes : [],
        scale: DEFAULT_ZOOM_SCALE,
        speed: DEFAULT_ZOOM_SPEED,
        source: 'automatic' as const,
      }
    })
    .filter((element): element is ZoomElement => element !== null)
  return removeOverlappingWindows(elements)
}
