import type {
  CursorButtonEvent,
  CursorEvent,
  CursorMoveEvent,
  CursorShapeEvent,
  CursorShapeAsset,
  CursorKind,
} from '../../../api/types/capture-api';
import { clickButtonForRecordedButton, type CursorClickButton } from '../../../api/types/cursor-settings';

export interface CursorPlaybackState {
  x: number;
  y: number;
  visible: boolean;
  cursorId: string | null;
  /** Legacy alias retained for bitmap-session rendering. */
  shapeId: string | null;
  cursorKind: CursorKind | null;
  hotspot: { x: number; y: number };
}

const isMove = (event: CursorEvent): event is CursorMoveEvent => event.event === 'move';
const isShape = (event: CursorEvent): event is CursorShapeEvent => event.event === 'shape';
const isButton = (event: CursorEvent): event is CursorButtonEvent => event.event === 'button';

const eventTime = (event: CursorEvent) => event.sessionNs / 1_000_000_000;
const clamp01 = (value: number) => Math.min(1, Math.max(0, value));
const smoothStep = (value: number) => {
  const clamped = clamp01(value);
  return clamped * clamped * (3 - 2 * clamped);
};

const smoothCoordinateAt = (
  before: CursorMoveEvent | null,
  start: CursorMoveEvent,
  end: CursorMoveEvent,
  after: CursorMoveEvent | null,
  timeSeconds: number,
  coordinate: (event: CursorMoveEvent) => number,
) => {
  const startTime = eventTime(start);
  const endTime = eventTime(end);
  const duration = Math.max(0.000001, endTime - startTime);
  const progress = clamp01((timeSeconds - startTime) / duration);

  // Without points on both sides there is no reliable tangent to estimate.
  // Easing this edge segment still removes the hard start/stop of a fast move.
  if (!before || !after) {
    const eased = smoothStep(progress);
    return coordinate(start) + (coordinate(end) - coordinate(start)) * eased;
  }

  const startSlope =
    before && startTime > eventTime(before)
      ? (coordinate(end) - coordinate(before)) / (endTime - eventTime(before))
      : (coordinate(end) - coordinate(start)) / duration;
  const endSlope =
    after && eventTime(after) > endTime
      ? (coordinate(after) - coordinate(start)) / (eventTime(after) - startTime)
      : (coordinate(end) - coordinate(start)) / duration;
  const progressSquared = progress * progress;
  const progressCubed = progressSquared * progress;
  const h00 = 2 * progressCubed - 3 * progressSquared + 1;
  const h10 = progressCubed - 2 * progressSquared + progress;
  const h01 = -2 * progressCubed + 3 * progressSquared;
  const h11 = progressCubed - progressSquared;
  const value =
    h00 * coordinate(start) + h10 * duration * startSlope + h01 * coordinate(end) + h11 * duration * endSlope;
  return clamp01(value);
};

const moveState = (event: CursorMoveEvent): CursorPlaybackState => ({
  x: event.normalizedX,
  y: event.normalizedY,
  visible: event.visible,
  cursorId: null,
  shapeId: null,
  cursorKind: null,
  hotspot: { x: 0, y: 0 },
});

export function cursorStateAt(
  events: CursorEvent[],
  timeSeconds: number,
  initialCursorId: string | null = null,
  initialHotspot = { x: 0, y: 0 },
): CursorPlaybackState | null {
  const isTimelineStart = timeSeconds === 0;
  const time = Math.max(0, timeSeconds);
  let previousMove: CursorMoveEvent | null = null;
  let beforePreviousMove: CursorMoveEvent | null = null;
  let nextMove: CursorMoveEvent | null = null;
  let afterNextMove: CursorMoveEvent | null = null;
  let visible = true;
  let cursorId = initialCursorId;
  let cursorKind: CursorKind | null = null;
  let hotspot = initialHotspot;

  for (const event of events) {
    if (eventTime(event) > time) {
      if (isMove(event)) {
        if (!nextMove) nextMove = event;
        else if (!afterNextMove) afterNextMove = event;
      }
      continue;
    }
    if (isMove(event)) {
      beforePreviousMove = previousMove;
      previousMove = event;
      visible = event.visible;
      cursorId = event.cursorId ?? cursorId;
    } else if (isShape(event)) {
      cursorId = event.cursorId ?? event.shapeId ?? null;
      cursorKind = event.cursorKind ?? null;
      hotspot = event.hotspot;
    } else if (event.event === 'visibility') {
      visible = event.visible;
    }
  }

  if (!previousMove) {
    if (isTimelineStart && nextMove) {
      const state = moveState(nextMove);
      state.visible = visible;
      state.cursorId = cursorId;
      state.shapeId = cursorId;
      state.cursorKind = cursorKind;
      state.hotspot = hotspot;
      return state;
    }
    return null;
  }

  const state = moveState(previousMove);
  state.visible = visible;
  state.cursorId = cursorId;
  state.shapeId = cursorId;
  state.cursorKind = cursorKind;
  state.hotspot = hotspot;
  if (nextMove && eventTime(nextMove) > eventTime(previousMove)) {
    state.x = smoothCoordinateAt(
      beforePreviousMove,
      previousMove,
      nextMove,
      afterNextMove,
      time,
      (event) => event.normalizedX,
    );
    state.y = smoothCoordinateAt(
      beforePreviousMove,
      previousMove,
      nextMove,
      afterNextMove,
      time,
      (event) => event.normalizedY,
    );
  }
  return state;
}

export function buttonEventsBetween(
  events: CursorEvent[],
  startSeconds: number,
  endSeconds: number,
  button?: CursorClickButton,
): CursorButtonEvent[] {
  if (endSeconds < startSeconds) return [];
  return events.filter(
    (event): event is CursorButtonEvent =>
      isButton(event) &&
      event.pressed &&
      eventTime(event) > startSeconds &&
      eventTime(event) <= endSeconds &&
      (button === undefined || clickButtonForRecordedButton(event.button) === button),
  );
}

export function cursorAssetForState(state: CursorPlaybackState | null, shapes: Record<string, CursorShapeAsset>) {
  const cursorId = state?.cursorId ?? state?.shapeId;
  return cursorId ? (shapes[cursorId] ?? null) : null;
}
