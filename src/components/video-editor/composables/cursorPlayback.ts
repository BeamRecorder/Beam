import type {
  CursorButtonEvent,
  CursorEvent,
  CursorMoveEvent,
  CursorShapeEvent,
  CursorShapeAsset,
} from '../../../api/types/capture-api'

export interface CursorPlaybackState {
  x: number
  y: number
  visible: boolean
  shapeId: string | null
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
  shapeId: null,
  hotspot: { x: 0, y: 0 },
})

export function cursorStateAt(
  events: CursorEvent[],
  timeSeconds: number,
  initialShapeId: string | null = null,
  initialHotspot = { x: 0, y: 0 },
): CursorPlaybackState | null {
  const time = Math.max(0, timeSeconds)
  let previousMove: CursorMoveEvent | null = null
  let nextMove: CursorMoveEvent | null = null
  let visible = true
  let shapeId = initialShapeId
  let hotspot = initialHotspot

  for (const event of events) {
    if (eventTime(event) > time) {
      if (isMove(event)) nextMove = event
      break
    }
    if (isMove(event)) {
      previousMove = event
      visible = event.visible
    } else if (isShape(event)) {
      shapeId = event.shapeId
      hotspot = event.hotspot
    } else if (event.event === 'visibility') {
      visible = event.visible
    }
  }

  if (!previousMove) return null

  const state = moveState(previousMove)
  state.visible = visible
  state.shapeId = shapeId
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
): CursorButtonEvent[] {
  if (endSeconds < startSeconds) return []
  return events.filter((event): event is CursorButtonEvent =>
    isButton(event) && event.pressed && eventTime(event) > startSeconds && eventTime(event) <= endSeconds,
  )
}

export function cursorAssetForState(
  state: CursorPlaybackState | null,
  shapes: Record<string, CursorShapeAsset>,
) {
  return state?.shapeId ? shapes[state.shapeId] ?? null : null
}
