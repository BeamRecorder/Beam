import type { DrawingPoint } from './element-types';

const MAX_SMOOTHED_POINTS = 512;

/** Equal arc-length samples make smoothing independent of pointer event frequency. */
function resample(points: readonly DrawingPoint[], distances: Float64Array, count: number): DrawingPoint[] {
  const length = distances[distances.length - 1]!;
  let segment = 1;
  return Array.from({ length: count }, (_, i) => {
    if (i === 0) return points[0]!;
    if (i === count - 1) return points[points.length - 1]!;
    const distance = (i * length) / (count - 1);
    while (segment < points.length - 1 && distances[segment]! <= distance) segment++;
    const a = points[segment - 1]!,
      b = points[segment]!;
    const span = distances[segment]! - distances[segment - 1]!;
    const t = span > 0 ? (distance - distances[segment - 1]!) / span : 0;
    return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
  });
}

/**
 * Quadratic Savitzky–Golay filter retains curvature, limiting the shrinkage
 * caused by averaging. Rolling moments keep the work linear,
 * even at maximum smoothing; only the bounded resampled path is filtered.
 */
function filterAxis(values: number[], radius: number, loop: boolean): number[] {
  const last = values.length - 1;
  const firstValue = values[0]!,
    lastValue = values[last]!;
  const extended = Array.from({ length: values.length + 2 * radius }, (_, offset) => {
    const i = offset - radius;
    if (i < 0) return loop ? values[last + i]! + firstValue - lastValue : 2 * firstValue - values[-i]!;
    if (i > last) return loop ? values[i - last]! + lastValue - firstValue : 2 * lastValue - values[2 * last - i]!;
    return values[i]!;
  });
  const denominator = (2 * radius + 1) * (4 * radius * radius + 4 * radius - 3);
  const constant = (3 * (3 * radius * radius + 3 * radius - 1)) / denominator;
  const quadratic = 15 / denominator;
  let sum = 0,
    moment = 0,
    squaredMoment = 0;
  for (let i = -radius; i <= radius; i++) {
    const value = extended[i + radius]!;
    sum += value;
    moment += i * value;
    squaredMoment += i * i * value;
  }
  const result: number[] = [];
  const min = Math.min(...values),
    max = Math.max(...values);
  for (let i = 0; i <= last; i++) {
    result.push(Math.max(min, Math.min(max, constant * sum - quadratic * squaredMoment)));
    if (i === last) break;
    const outgoing = extended[i]!,
      incoming = extended[i + 2 * radius + 1]!;
    sum -= outgoing;
    moment += radius * outgoing;
    squaredMoment -= radius * radius * outgoing;
    squaredMoment += sum - 2 * moment + radius * radius * incoming;
    moment += -sum + radius * incoming;
    sum += incoming;
  }
  if (!loop) {
    result[0] = firstValue;
    result[last] = lastValue;
  }
  return result;
}

/** Keep raw points in the project; derive the same curve for preview, editing and export. */
export function smoothFreehandPoints(
  points: readonly DrawingPoint[],
  smoothing: number,
  width: number,
  height: number,
): readonly DrawingPoint[] {
  if (smoothing <= 0 || points.length < 5 || width <= 0 || height <= 0) return points;
  const distances = new Float64Array(points.length);
  let minX = Infinity,
    minY = Infinity,
    maxX = -Infinity,
    maxY = -Infinity;
  for (let i = 0; i < points.length; i++) {
    const p = points[i]!;
    minX = Math.min(minX, p.x);
    maxX = Math.max(maxX, p.x);
    minY = Math.min(minY, p.y);
    maxY = Math.max(maxY, p.y);
    if (i > 0) {
      const previous = points[i - 1]!;
      distances[i] = distances[i - 1]! + Math.hypot((p.x - previous.x) * width, (p.y - previous.y) * height);
    }
  }
  const length = distances[points.length - 1]!;
  const diagonal = Math.hypot((maxX - minX) * width, (maxY - minY) * height);
  if (!length || !diagonal) return points.slice(0, 1);
  const count = Math.min(MAX_SMOOTHED_POINTS, Math.max(5, Math.ceil((length / diagonal) * 96) + 1));
  const strength = Math.min(100, smoothing) / 100;
  const radius = Math.min(
    Math.floor((count - 1) / 4),
    Math.round(((count - 1) * diagonal * 0.55 * strength ** 2) / length),
  );
  // Avoid erasing large turns when a very long path cannot resolve this window.
  if (radius < 2) return points;
  const sampled = resample(points, distances, count);
  const first = points[0]!,
    last = points[points.length - 1]!;
  // Continue a nearly closed gesture across its seam, preserving any small gap.
  const loop =
    length > 2 * diagonal && Math.hypot((last.x - first.x) * width, (last.y - first.y) * height) < diagonal * 0.03;
  const xs = filterAxis(
    sampled.map((p) => p.x),
    radius,
    loop,
  );
  const ys = filterAxis(
    sampled.map((p) => p.y),
    radius,
    loop,
  );
  return xs.map((x, i) => ({ x, y: ys[i]! }));
}
