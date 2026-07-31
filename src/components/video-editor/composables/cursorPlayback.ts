import type {
  CursorButtonEvent,
  CursorEvent,
  CursorMoveEvent,
  CursorShapeEvent,
  CursorShapeAsset,
  CursorKind,
} from '../../../api/types/capture-api'
import { clickButtonForRecordedButton, type CursorClickButton } from '../../../api/types/cursor-settings'

export interface CursorPlaybackState {
  x: number
  y: number
  visible: boolean
  cursorId: string | null
  /** Legacy alias retained for bitmap-session rendering. */
  shapeId: string | null
  cursorKind: CursorKind | null
  hotspot: { x: number; y: number }
}

const isMove = (event: CursorEvent): event is CursorMoveEvent => event.event === 'move'
const isShape = (event: CursorEvent): event is CursorShapeEvent => event.event === 'shape'
const isButton = (event: CursorEvent): event is CursorButtonEvent => event.event === 'button'

const eventTime = (event: CursorEvent) => event.sessionNs / 1_000_000_000

const moveState = (event: CursorMoveEvent): CursorPlaybackState => ({
  x: event.normalizedX,
  y: event.normalizedY,
  visible: event.visible,
  cursorId: null,
  shapeId: null,
  cursorKind: null,
  hotspot: { x: 0, y: 0 },
})

export function cursorStateAt(
  events: CursorEvent[],
  timeSeconds: number,
  initialCursorId: string | null = null,
  initialHotspot = { x: 0, y: 0 },
): CursorPlaybackState | null {
  const isTimelineStart = timeSeconds === 0
  const time = Math.max(0, timeSeconds)
  let previousMove: CursorMoveEvent | null = null
  let nextMove: CursorMoveEvent | null = null
  let visible = true
  let cursorId = initialCursorId
  let cursorKind: CursorKind | null = null
  let hotspot = initialHotspot

  for (const event of events) {
    if (eventTime(event) > time) {
      if (isMove(event) && !nextMove) nextMove = event
      continue
    }
    if (isMove(event)) {
      previousMove = event
      visible = event.visible
    } else if (isShape(event)) {
      cursorId = event.cursorId ?? event.shapeId ?? null
      cursorKind = event.cursorKind ?? null
      hotspot = event.hotspot
    } else if (event.event === 'visibility') {
      visible = event.visible
    }
  }

  if (!previousMove) {
    if (isTimelineStart && nextMove) {
      const state = moveState(nextMove)
      state.visible = visible
      state.cursorId = cursorId
      state.shapeId = cursorId
      state.cursorKind = cursorKind
      state.hotspot = hotspot
      return state
    }
    return null
  }

  const state = moveState(previousMove)
  state.visible = visible
  state.cursorId = cursorId
  state.shapeId = cursorId
  state.cursorKind = cursorKind
  state.hotspot = hotspot
  if (nextMove && eventTime(nextMove) > eventTime(previousMove)) {
    const ratio = Math.min(1, Math.max(0, (time - eventTime(previousMove)) / (eventTime(nextMove) - eventTime(previousMove))))
    state.x += (nextMove.normalizedX - state.x) * ratio
    state.y += (nextMove.normalizedY - state.y) * ratio
  }
  return state
}

export function buttonEventsBetween(
  events: CursorEvent[],
  startSeconds: number,
  endSeconds: number,
  button?: CursorClickButton,
): CursorButtonEvent[] {
  if (endSeconds < startSeconds) return []
  return events.filter((event): event is CursorButtonEvent =>
    isButton(event)
      && event.pressed
      && eventTime(event) > startSeconds
      && eventTime(event) <= endSeconds
      && (button === undefined || clickButtonForRecordedButton(event.button) === button),
  )
}

export function cursorAssetForState(
  state: CursorPlaybackState | null,
  shapes: Record<string, CursorShapeAsset>,
) {
  const cursorId = state?.cursorId ?? state?.shapeId
  return cursorId ? shapes[cursorId] ?? null : null
}
