import type { CursorButtonEvent, CursorEvent } from '../../../api/types/capture-api';
import type { CursorMotionSettings } from '../../../api/types/cursor-settings';
import type { RecordedCursorPoint } from './cursor-motion-types';
import type { CursorPlaybackState } from './cursorPlayback';
import { cursorStateAt } from './cursorPlayback';
import { createDeterministicCursorMotionEvaluator } from './cursor-motion-evaluator';

export { stepSpringAxis } from './cursor-motion-evaluator';

export interface CursorMotionAnchor {
  timeSeconds: number;
  x: number;
  y: number;
  kind: 'start' | 'end' | 'click' | 'stop' | 'direction' | 'distance';
}

export interface CursorMotionSegment {
  startSeconds: number;
  endSeconds: number;
  startX: number;
  startY: number;
  endX: number;
  endY: number;
  previous: CursorMotionAnchor | null;
  start: CursorMotionAnchor;
  end: CursorMotionAnchor;
  after: CursorMotionAnchor | null;
}

export interface CursorMotionTimeline {
  anchors: CursorMotionAnchor[];
  segments: CursorMotionSegment[];
  targetAt(timeSeconds: number): { x: number; y: number } | null;
}

export interface CursorMotionSample extends CursorPlaybackState {
  previousX: number;
  previousY: number;
  deltaSeconds: number;
}

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));
const clamp01 = (value: number) => clamp(value, 0, 1);
const distance = (left: { x: number; y: number }, right: { x: number; y: number }, width: number, height: number) =>
  Math.hypot((left.x - right.x) * width, (left.y - right.y) * height);

export const minimumJerk = (progress: number) => {
  const t = clamp01(progress);
  return 10 * t ** 3 - 15 * t ** 4 + 6 * t ** 5;
};

const moveEvents = (events: CursorEvent[]) =>
  events.filter((event) => event.event === 'move').sort((left, right) => left.sessionNs - right.sessionNs);

const eventTime = (event: CursorEvent) => event.sessionNs / 1_000_000_000;

const buttonEvents = (events: CursorEvent[]) =>
  events.filter((event): event is CursorButtonEvent => event.event === 'button');

/** Preserves every recorded move and interaction position without path retiming. */
const createRecordedCursorTarget = (events: CursorEvent[]) => {
  const points = events
    .filter((event) => event.event === 'move' || event.event === 'button')
    .map((event, order) => ({
      timeSeconds: eventTime(event),
      x: event.normalizedX,
      y: event.normalizedY,
      order,
      interaction: event.event === 'button',
    }))
    .sort(
      (left, right) =>
        left.timeSeconds - right.timeSeconds ||
        Number(left.interaction) - Number(right.interaction) ||
        left.order - right.order,
    )
    .reduce<RecordedCursorPoint[]>((result, point) => {
      if (result.at(-1)?.timeSeconds === point.timeSeconds) result[result.length - 1] = point;
      else result.push(point);
      return result;
    }, []);

  return (timeSeconds: number): { x: number; y: number } | null => {
    if (!points.length) return null;
    const time = Number.isNaN(timeSeconds) ? Number.POSITIVE_INFINITY : Math.max(0, timeSeconds);
    if (time <= points[0]!.timeSeconds) return { x: points[0]!.x, y: points[0]!.y };
    let low = 0;
    let high = points.length;
    while (low < high) {
      const middle = low + Math.floor((high - low) / 2);
      if (points[middle]!.timeSeconds <= time) low = middle + 1;
      else high = middle;
    }
    const previous = points[low - 1]!;
    const next = points[low];
    if (!next) return { x: previous.x, y: previous.y };
    const progress = (time - previous.timeSeconds) / Math.max(0.000001, next.timeSeconds - previous.timeSeconds);
    return {
      x: previous.x + (next.x - previous.x) * progress,
      y: previous.y + (next.y - previous.y) * progress,
    };
  };
};

const dragRanges = (events: CursorEvent[]) => {
  const ranges: Array<{ startSeconds: number; endSeconds: number }> = [];
  let startSeconds: number | null = null;
  for (const event of buttonEvents(events)
    .filter((event) => event.button === 1)
    .sort((left, right) => left.sessionNs - right.sessionNs)) {
    if (event.pressed) {
      startSeconds = eventTime(event);
    } else if (startSeconds !== null) {
      ranges.push({ startSeconds, endSeconds: eventTime(event) });
      startSeconds = null;
    }
  }
  if (startSeconds !== null) ranges.push({ startSeconds, endSeconds: Number.POSITIVE_INFINITY });
  return ranges;
};

const angleBetween = (
  before: { x: number; y: number },
  center: { x: number; y: number },
  after: { x: number; y: number },
) => {
  const first = { x: center.x - before.x, y: center.y - before.y };
  const second = { x: after.x - center.x, y: after.y - center.y };
  const firstLength = Math.hypot(first.x, first.y);
  const secondLength = Math.hypot(second.x, second.y);
  if (firstLength < 0.0001 || secondLength < 0.0001) return 0;
  return Math.acos(clamp((first.x * second.x + first.y * second.y) / (firstLength * secondLength), -1, 1));
};

export function extractCursorMotionAnchors(
  events: CursorEvent[],
  sourceWidth = 1920,
  sourceHeight = 1080,
): CursorMotionAnchor[] {
  const moves = moveEvents(events);
  if (!moves.length) return [];
  const anchors: CursorMotionAnchor[] = [
    {
      timeSeconds: eventTime(moves[0]),
      x: moves[0].normalizedX,
      y: moves[0].normalizedY,
      kind: 'start',
    },
  ];
  const lastAnchor = () => anchors[anchors.length - 1];
  let futureIndex = 1;

  for (let index = 1; index < moves.length - 1; index += 1) {
    const current = moves[index];
    const previous = moves[index - 1];
    const next = moves[index + 1];
    const currentPoint = { x: current.normalizedX, y: current.normalizedY };
    const previousPoint = { x: previous.normalizedX, y: previous.normalizedY };
    const nextPoint = { x: next.normalizedX, y: next.normalizedY };
    const currentTime = eventTime(current);
    const previousTime = eventTime(previous);
    const speed =
      distance(previousPoint, currentPoint, sourceWidth, sourceHeight) / Math.max(0.001, currentTime - previousTime);
    futureIndex = Math.max(futureIndex, index + 1);
    while (futureIndex < moves.length && eventTime(moves[futureIndex]) - currentTime < 0.08) {
      futureIndex += 1;
    }
    const future = moves[futureIndex];
    const stopped =
      speed <= 35 &&
      Boolean(future) &&
      distance(
        currentPoint,
        {
          x: future?.normalizedX ?? current.normalizedX,
          y: future?.normalizedY ?? current.normalizedY,
        },
        sourceWidth,
        sourceHeight,
      ) <= 4;
    const turned =
      angleBetween(previousPoint, currentPoint, nextPoint) >= Math.PI / 4 &&
      distance(previousPoint, nextPoint, sourceWidth, sourceHeight) >= 24;
    const farEnough = distance(currentPoint, lastAnchor(), sourceWidth, sourceHeight) >= 96;
    if (stopped || turned || farEnough) {
      anchors.push({
        timeSeconds: currentTime,
        x: current.normalizedX,
        y: current.normalizedY,
        kind: stopped ? 'stop' : turned ? 'direction' : 'distance',
      });
    }
  }

  for (const click of buttonEvents(events)) {
    anchors.push({
      timeSeconds: eventTime(click),
      x: click.normalizedX,
      y: click.normalizedY,
      kind: 'click',
    });
  }

  const last = moves[moves.length - 1];
  anchors.push({ timeSeconds: eventTime(last), x: last.normalizedX, y: last.normalizedY, kind: 'end' });
  return anchors
    .sort((left, right) => left.timeSeconds - right.timeSeconds || (left.kind === 'click' ? -1 : 1))
    .filter(
      (anchor, index, all) =>
        index === 0 ||
        anchor.timeSeconds > all[index - 1].timeSeconds + 0.000001 ||
        distance(anchor, all[index - 1], sourceWidth, sourceHeight) > 1,
    );
}

const catmullRom = (
  before: CursorMotionAnchor | null,
  start: CursorMotionAnchor,
  end: CursorMotionAnchor,
  after: CursorMotionAnchor | null,
  progress: number,
) => {
  const p0 = before ?? start;
  const p1 = start;
  const p2 = end;
  const p3 = after ?? end;
  const t = clamp01(progress);
  const t2 = t * t;
  const t3 = t2 * t;
  const coordinate = (key: 'x' | 'y') =>
    clamp01(
      0.5 *
        (2 * p1[key] +
          (-p0[key] + p2[key]) * t +
          (2 * p0[key] - 5 * p1[key] + 4 * p2[key] - p3[key]) * t2 +
          (-p0[key] + 3 * p1[key] - 3 * p2[key] + p3[key]) * t3),
    );
  return { x: coordinate('x'), y: coordinate('y') };
};

export function createCursorMotionTimeline(
  events: CursorEvent[],
  _settings: CursorMotionSettings,
  sourceWidth = 1920,
  sourceHeight = 1080,
): CursorMotionTimeline {
  const anchors = extractCursorMotionAnchors(events, sourceWidth, sourceHeight);
  const segments: CursorMotionSegment[] = [];
  const desiredDuration = (start: CursorMotionAnchor, end: CursorMotionAnchor) =>
    clamp(140 + distance(start, end, sourceWidth, sourceHeight) * 0.18, 180, 450) / 1_000;
  const addSegment = (index: number, startSeconds: number, endSeconds: number) => {
    const start = anchors[index - 1];
    const end = anchors[index];
    segments.push({
      startSeconds,
      endSeconds: Math.max(startSeconds, endSeconds),
      startX: start.x,
      startY: start.y,
      endX: end.x,
      endY: end.y,
      previous: anchors[index - 2] ?? null,
      start,
      end,
      after: anchors[index + 1] ?? null,
    });
  };

  let cursorTime = anchors[0]?.timeSeconds ?? 0;
  const nextClickIndexes = Array.from({ length: anchors.length + 1 }, () => -1);
  let nextClickIndex = -1;
  for (let candidate = anchors.length - 1; candidate >= 0; candidate -= 1) {
    if (anchors[candidate]!.kind === 'click') nextClickIndex = candidate;
    nextClickIndexes[candidate] = nextClickIndex;
  }
  let index = 1;
  while (index < anchors.length) {
    const clickIndex = nextClickIndexes[index] ?? -1;
    if (clickIndex >= 0) {
      const blockStartIndex = index - 1;
      const durations = anchors
        .slice(index, clickIndex + 1)
        .map((anchor, offset) => desiredDuration(anchors[index + offset - 1], anchor));
      const totalDuration = durations.reduce((total, duration) => total + duration, 0);
      const availableDuration = Math.max(0, anchors[clickIndex].timeSeconds - cursorTime);
      const scale = totalDuration > 0 ? availableDuration / totalDuration : 1;
      let segmentStart = cursorTime;
      for (let offset = 0; offset < durations.length; offset += 1) {
        const segmentIndex = blockStartIndex + offset + 1;
        const segmentDuration = durations[offset] * scale;
        const segmentEnd =
          offset === durations.length - 1 ? anchors[clickIndex].timeSeconds : segmentStart + segmentDuration;
        addSegment(segmentIndex, segmentStart, segmentEnd);
        segmentStart = segmentEnd;
      }
      cursorTime = anchors[clickIndex].timeSeconds;
      index = clickIndex + 1;
      continue;
    }

    const end = anchors[index];
    // Preserve the recorded interval. Retiming every move to a fixed
    // 180–450 ms window makes sparse Linux cursor samples look frozen and
    // then rush to catch up near the next PipeWire anchor.
    const segmentStart = cursorTime;
    const segmentEnd = Math.max(segmentStart, end.timeSeconds);
    addSegment(index, segmentStart, segmentEnd);
    cursorTime = segmentEnd;
    index += 1;
  }
  return {
    anchors,
    segments,
    targetAt(timeSeconds) {
      if (!anchors.length) return null;
      const time = Number.isNaN(timeSeconds) ? Number.POSITIVE_INFINITY : Math.max(0, timeSeconds);
      if (time <= anchors[0].timeSeconds) return { x: anchors[0].x, y: anchors[0].y };
      let low = 0;
      let high = segments.length;
      while (low < high) {
        const middle = low + Math.floor((high - low) / 2);
        if (segments[middle]!.endSeconds < time) low = middle + 1;
        else high = middle;
      }
      const segment = segments[low];
      if (segment) {
        if (time < segment.startSeconds) return { x: segment.startX, y: segment.startY };
        const progress = (time - segment.startSeconds) / Math.max(0.000001, segment.endSeconds - segment.startSeconds);
        return catmullRom(segment.previous, segment.start, segment.end, segment.after, minimumJerk(progress));
      }
      const last = anchors[anchors.length - 1];
      return { x: last.x, y: last.y };
    },
  };
}

export function createCursorMotionPlayer(
  events: CursorEvent[],
  settings: CursorMotionSettings,
  sourceWidth = 1920,
  sourceHeight = 1080,
) {
  const stylizedTimeline = createCursorMotionTimeline(events, settings, sourceWidth, sourceHeight);
  const recordedTargetAt = createRecordedCursorTarget(events);
  const timeline: CursorMotionTimeline = { ...stylizedTimeline, targetAt: recordedTargetAt };
  const buttonTimes = buttonEvents(events).map(eventTime);
  const drags = dragRanges(events);
  const evaluator = createDeterministicCursorMotionEvaluator({
    settings,
    targetAt: recordedTargetAt,
    directTargetAt: recordedTargetAt,
    isDraggingAt: (timeSeconds) =>
      drags.some((range) => timeSeconds >= range.startSeconds && timeSeconds <= range.endSeconds),
    buttonTimes,
  });
  const sample = (timeSeconds: number, rawState: CursorPlaybackState | null): CursorMotionSample | null => {
    if (!rawState) return null;
    const motion = evaluator.sample(timeSeconds);
    return {
      ...rawState,
      ...motion,
    };
  };
  return { timeline, sample, reset: evaluator.reset };
}

export function motionBlurTrail(
  current: { x: number; y: number },
  previous: { x: number; y: number },
  deltaSeconds: number,
  intensity: number,
  viewport: { width: number; height: number },
) {
  const normalizedIntensity = clamp(intensity, 0, 1);
  if (normalizedIntensity <= 0 || deltaSeconds <= 0) return [{ x: current.x, y: current.y, alpha: 1 }];
  const dx = (current.x - previous.x) * viewport.width;
  const dy = (current.y - previous.y) * viewport.height;
  const speed = Math.hypot(dx, dy) / deltaSeconds;
  const blurDistance = clamp(speed * normalizedIntensity * 0.08, 0, 72);
  if (blurDistance < 1) return [{ x: current.x, y: current.y, alpha: 1 }];
  const kernel = blurDistance < 10 ? 5 : blurDistance < 28 ? 7 : 9;
  const length = Math.max(1, Math.hypot(dx, dy));
  const unitX = dx / length;
  const unitY = dy / length;
  return Array.from({ length: kernel }, (_, index) => {
    const progress = (kernel - index - 1) / (kernel - 1);
    return {
      x: current.x - (unitX * blurDistance * progress) / viewport.width,
      y: current.y - (unitY * blurDistance * progress) / viewport.height,
      alpha: index === kernel - 1 ? 1 : (1 - progress) * 0.42,
    };
  });
}

export function cursorMotionStateAt(
  events: CursorEvent[],
  settings: CursorMotionSettings,
  timeSeconds: number,
  sourceWidth = 1920,
  sourceHeight = 1080,
) {
  const raw = cursorStateAt(events, timeSeconds);
  return createCursorMotionPlayer(events, settings, sourceWidth, sourceHeight).sample(timeSeconds, raw);
}
