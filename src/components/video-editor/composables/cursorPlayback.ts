import type {
  CursorButtonEvent,
  CursorEvent,
  CursorMoveEvent,
  CursorShapeEvent,
  CursorShapeAsset,
  CursorKind,
} from '../../../api/types/capture-api';
import {
  clickButtonForRecordedButton,
  type CursorAutoHideSettings,
  type CursorClickButton,
} from '../../../api/types/cursor-settings';

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

interface CursorStateCheckpoint {
  visible: boolean;
  cursorIdAssigned: boolean;
  cursorId: string | null;
  cursorKind: CursorKind | null;
  hotspot: { x: number; y: number } | null;
}

export interface CursorEventIndex {
  stateAt(
    timeSeconds: number,
    initialCursorId?: string | null,
    initialHotspot?: { x: number; y: number },
  ): CursorPlaybackState | null;
  buttonsBetween(startSeconds: number, endSeconds: number, button?: CursorClickButton): CursorButtonEvent[];
  idleSecondsAt(timeSeconds: number): number;
}

const upperBound = (values: readonly number[], target: number) => {
  let low = 0;
  let high = values.length;
  while (low < high) {
    const middle = low + Math.floor((high - low) / 2);
    if (values[middle]! <= target) low = middle + 1;
    else high = middle;
  }
  return low;
};

export function createCursorEventIndex(events: CursorEvent[]): CursorEventIndex {
  const chronological = events.every((event, index) => index === 0 || events[index - 1]!.sessionNs <= event.sessionNs);
  const ordered = chronological
    ? events
    : events
        .map((event, order) => ({ event, order }))
        .sort((left, right) => left.event.sessionNs - right.event.sessionNs || left.order - right.order)
        .map(({ event }) => event);
  const moves = ordered.filter(isMove);
  const moveTimes = moves.map(eventTime);
  const pressedButtons = ordered.filter((event): event is CursorButtonEvent => isButton(event) && event.pressed);
  const buttonTimes = pressedButtons.map(eventTime);
  const activityTimes: number[] = [];
  let previousMove: CursorMoveEvent | null = null;
  for (const event of ordered) {
    if (isMove(event)) {
      if (
        !previousMove ||
        event.normalizedX !== previousMove.normalizedX ||
        event.normalizedY !== previousMove.normalizedY ||
        (event.visible && !previousMove.visible)
      )
        activityTimes.push(eventTime(event));
      previousMove = event;
    } else if ((isButton(event) && event.pressed) || (event.event === 'visibility' && event.visible)) {
      activityTimes.push(eventTime(event));
    }
  }
  const checkpointTimes: number[] = [];
  const checkpoints: CursorStateCheckpoint[] = [];
  let checkpoint: CursorStateCheckpoint = {
    visible: true,
    cursorIdAssigned: false,
    cursorId: null,
    cursorKind: null,
    hotspot: null,
  };

  for (const event of ordered) {
    if (isMove(event)) {
      checkpoint = {
        ...checkpoint,
        visible: event.visible,
        cursorIdAssigned: checkpoint.cursorIdAssigned || event.cursorId != null,
        cursorId: event.cursorId ?? checkpoint.cursorId,
      };
    } else if (isShape(event)) {
      checkpoint = {
        ...checkpoint,
        cursorIdAssigned: true,
        cursorId: event.cursorId ?? event.shapeId ?? null,
        cursorKind: event.cursorKind ?? null,
        hotspot: event.hotspot,
      };
    } else if (event.event === 'visibility') {
      checkpoint = { ...checkpoint, visible: event.visible };
    } else {
      continue;
    }
    checkpointTimes.push(eventTime(event));
    checkpoints.push(checkpoint);
  }

  return {
    stateAt(timeSeconds, initialCursorId = null, initialHotspot = { x: 0, y: 0 }) {
      const isTimelineStart = timeSeconds === 0;
      const time = Number.isNaN(timeSeconds) ? Number.POSITIVE_INFINITY : Math.max(0, timeSeconds);
      const nextMoveIndex = upperBound(moveTimes, time);
      const previousMove = moves[nextMoveIndex - 1] ?? null;
      const beforePreviousMove = moves[nextMoveIndex - 2] ?? null;
      const nextMove = moves[nextMoveIndex] ?? null;
      const afterNextMove = moves[nextMoveIndex + 1] ?? null;
      const stateCheckpoint = checkpoints[upperBound(checkpointTimes, time) - 1];
      const visible = stateCheckpoint?.visible ?? true;
      const cursorId = stateCheckpoint?.cursorIdAssigned ? stateCheckpoint.cursorId : initialCursorId;
      const cursorKind = stateCheckpoint?.cursorKind ?? null;
      const hotspot = stateCheckpoint?.hotspot ?? initialHotspot;

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
    },
    buttonsBetween(startSeconds, endSeconds, button) {
      if (Number.isNaN(startSeconds) || Number.isNaN(endSeconds) || endSeconds < startSeconds) return [];
      const start = upperBound(buttonTimes, startSeconds);
      const end = upperBound(buttonTimes, endSeconds);
      const matches = pressedButtons.slice(start, end);
      return button === undefined
        ? matches
        : matches.filter((event) => clickButtonForRecordedButton(event.button) === button);
    },
    idleSecondsAt(timeSeconds) {
      const time = Number.isNaN(timeSeconds) ? Number.POSITIVE_INFINITY : Math.max(0, timeSeconds);
      const lastActivity = activityTimes[upperBound(activityTimes, time) - 1] ?? 0;
      return Math.max(0, time - lastActivity);
    },
  };
}

const cachedIndexes = new WeakMap<
  CursorEvent[],
  { length: number; last: CursorEvent | undefined; index: CursorEventIndex }
>();

export function cursorEventIndexFor(events: CursorEvent[]): CursorEventIndex {
  // Captured cursor events are immutable session data. A replaced array builds a
  // new index, while every playback frame reuses the existing one.
  const cached = cachedIndexes.get(events);
  const last = events.at(-1);
  if (cached && cached.length === events.length && cached.last === last) return cached.index;
  const index = createCursorEventIndex(events);
  cachedIndexes.set(events, { length: events.length, last, index });
  return index;
}

export function cursorStateAt(
  events: CursorEvent[],
  timeSeconds: number,
  initialCursorId: string | null = null,
  initialHotspot = { x: 0, y: 0 },
): CursorPlaybackState | null {
  return cursorEventIndexFor(events).stateAt(timeSeconds, initialCursorId, initialHotspot);
}

export function buttonEventsBetween(
  events: CursorEvent[],
  startSeconds: number,
  endSeconds: number,
  button?: CursorClickButton,
): CursorButtonEvent[] {
  return cursorEventIndexFor(events).buttonsBetween(startSeconds, endSeconds, button);
}

export function cursorAutoHiddenAt(
  events: CursorEvent[],
  timeSeconds: number,
  settings: CursorAutoHideSettings,
): boolean {
  return settings.enabled && cursorEventIndexFor(events).idleSecondsAt(timeSeconds) >= settings.delaySeconds;
}

export function cursorAssetForState(state: CursorPlaybackState | null, shapes: Record<string, CursorShapeAsset>) {
  const cursorId = state?.cursorId ?? state?.shapeId;
  return cursorId ? (shapes[cursorId] ?? null) : null;
}
