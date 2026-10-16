import type { CursorEvent } from '@beam/engine/capture/capture-session';
import type { HoverPoint } from './hover-types';

/** Only positions cross the worker boundary; shape bitmaps and large telemetry records stay with their owner. */
export function packHoverPath(events: readonly CursorEvent[]): Float64Array {
  const positions = events
    .filter((event) => event.event === 'move' || event.event === 'button' || event.event === 'visibility')
    .sort((a, b) => a.sessionNs - b.sessionNs || Number(a.event === 'button') - Number(b.event === 'button'));
  const path = new Float64Array(positions.length * 4);
  let visible = true;
  let dragging = false;
  let x = NaN;
  let y = NaN;
  let count = 0;
  for (const event of positions) {
    if (event.event === 'visibility') visible = event.visible;
    else {
      x = event.normalizedX;
      y = event.normalizedY;
      if (event.event === 'move') visible = event.visible;
      if (event.event === 'button' && event.button === 1) dragging = event.pressed;
    }
    const time = event.sessionNs / 1e9;
    if (
      !Number.isFinite(time) ||
      !Number.isFinite(x) ||
      !Number.isFinite(y) ||
      time < 0 ||
      x < 0 ||
      x > 1 ||
      y < 0 ||
      y > 1
    )
      continue;
    if (count && path[(count - 1) * 4] === time) count--;
    const offset = count++ * 4;
    path[offset] = time;
    path[offset + 1] = x;
    path[offset + 2] = y;
    path[offset + 3] = Number(visible && !dragging);
  }
  return count === positions.length ? path : path.slice(0, count * 4);
}

export function hoverPointAt(path: Float64Array, time: number): HoverPoint | null {
  if (!path.length || !Number.isFinite(time) || time < path[0]!) return null;
  let low = 0;
  let high = path.length / 4;
  while (low < high) {
    const middle = (low + high) >>> 1;
    if (path[middle * 4]! <= time) low = middle + 1;
    else high = middle;
  }
  const index = (low - 1) * 4;
  const next = index + 4;
  const progress = next < path.length ? Math.min(1, (time - path[index]!) / (path[next]! - path[index]!)) : 0;
  return {
    time,
    x: path[index + 1]! + ((path[next + 1] ?? path[index + 1]!) - path[index + 1]!) * progress,
    y: path[index + 2]! + ((path[next + 2] ?? path[index + 2]!) - path[index + 2]!) * progress,
    active: path[index + 3] === 1,
  };
}

/** Visit only movement neighborhoods, at 60 Hz. Long static tails do not trigger a full-video scan. */
export function* hoverTimestamps(path: Float64Array, start: number, duration: number): Generator<number> {
  const end = start + duration;
  let lastTick = -1;
  let low = 0,
    high = path.length / 4;
  while (low < high) {
    const middle = (low + high) >>> 1;
    if (path[middle * 4]! < start - 0.65) low = middle + 1;
    else high = middle;
  }
  for (let index = Math.max(4, low * 4); index < path.length; index += 4) {
    const time = path[index]!;
    const previousTime = path[index - 4]!;
    if (time < start - 0.15) continue;
    if (previousTime > end + 0.15) break;
    if (
      path[index + 3] !== 1 ||
      path[index - 1] !== 1 ||
      Math.hypot(path[index + 1]! - path[index - 3]!, path[index + 2]! - path[index - 2]!) < 0.0001
    )
      continue;
    const first = Math.max(0, Math.floor((Math.max(previousTime, time - 0.5) - start - 0.1) * 60), lastTick + 1);
    const last = Math.min(Math.ceil(duration * 60) - 1, Math.ceil((time - start + 0.15) * 60));
    for (let tick = first; tick <= last; tick++) {
      lastTick = tick;
      yield tick / 60;
    }
  }
}
