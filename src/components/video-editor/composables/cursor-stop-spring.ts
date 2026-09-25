import type { CursorEvent } from '../../../api/types/capture-api';
import type { CursorMotionSettings } from '../../../api/types/cursor-settings';

interface StopSpring {
  timeSeconds: number;
  endSeconds: number;
  x: number;
  y: number;
}

const timeOf = (event: CursorEvent) => event.sessionNs / 1_000_000_000;

/** A small, recorded-direction wobble that begins only when a movement settles. */
export function createCursorStopSpring(
  events: CursorEvent[],
  settings: CursorMotionSettings,
  width: number,
  height: number,
  isDraggingAt: (timeSeconds: number) => boolean,
) {
  if (!settings.stopSpringEnabled || settings.stopSpringStrength <= 0) return () => ({ x: 0, y: 0 });

  const moves = events.filter((event) => event.event === 'move').sort((a, b) => a.sessionNs - b.sessionNs);
  const buttonTimes = events
    .filter((event) => event.event === 'button')
    .map(timeOf)
    .sort((a, b) => a - b);
  const sourceWidth = Math.max(1, width);
  const sourceHeight = Math.max(1, height);
  const springs: StopSpring[] = [];

  for (let index = 1; index < moves.length; index += 1) {
    const current = moves[index]!;
    const next = moves[index + 1];
    const stopTime = timeOf(current);
    // A long gap between different positions is a pause; a short gap is
    // continuous movement. Repeated positions also mark a stop.
    if (
      next &&
      timeOf(next) - stopTime <= 0.5 &&
      Math.hypot(
        (next.normalizedX - current.normalizedX) * sourceWidth,
        (next.normalizedY - current.normalizedY) * sourceHeight,
      ) > 4
    )
      continue;

    let beforeIndex = index - 1;
    while (beforeIndex > 0 && stopTime - timeOf(moves[beforeIndex]!) < 0.12) beforeIndex -= 1;
    const before = moves[beforeIndex]!;
    const dx = (current.normalizedX - before.normalizedX) * sourceWidth;
    const dy = (current.normalizedY - before.normalizedY) * sourceHeight;
    const distance = Math.hypot(dx, dy);
    if (distance < 8 || stopTime - timeOf(before) > 0.5) continue;
    if (springs.at(-1) && stopTime - springs.at(-1)!.timeSeconds < 0.2) continue;
    if (isDraggingAt(stopTime)) continue;

    const amplitude = Math.min(12, distance * 0.18) * settings.stopSpringStrength;
    let nextTravelTime = Infinity;
    for (let nextIndex = index + 1; nextIndex < moves.length; nextIndex += 1) {
      const move = moves[nextIndex]!;
      if (timeOf(move) - stopTime >= 0.45) break;
      if (
        Math.hypot(
          (move.normalizedX - current.normalizedX) * sourceWidth,
          (move.normalizedY - current.normalizedY) * sourceHeight,
        ) > 4
      ) {
        nextTravelTime = timeOf(moves[nextIndex - 1]!);
        break;
      }
    }
    const nextButton = buttonTimes.find((time) => time >= stopTime);
    if (nextButton !== undefined && Math.abs(nextButton - stopTime) < 0.001) continue;
    springs.push({
      timeSeconds: stopTime,
      endSeconds: Math.min(stopTime + 0.45, nextTravelTime, nextButton ?? Infinity),
      x: ((dx / distance) * amplitude) / sourceWidth,
      y: ((dy / distance) * amplitude) / sourceHeight,
    });
  }

  return (timeSeconds: number) => {
    let low = 0;
    let high = springs.length;
    while (low < high) {
      const middle = (low + high) >>> 1;
      if (springs[middle]!.timeSeconds <= timeSeconds) low = middle + 1;
      else high = middle;
    }
    const spring = springs[low - 1];
    if (!spring || timeSeconds >= spring.endSeconds || isDraggingAt(timeSeconds)) return { x: 0, y: 0 };
    const elapsed = timeSeconds - spring.timeSeconds;
    const displacement = Math.sin(2 * Math.PI * 7 * elapsed) * Math.exp(-10 * elapsed);
    return { x: spring.x * displacement, y: spring.y * displacement };
  };
}
