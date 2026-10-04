import type { AnimationEasing, AnimationInterpolator, AnimationValue, PropertyTrack } from './scene-types';

const number = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value);
const color = (value: unknown): value is string =>
  typeof value === 'string' && /^#[\da-f]{6}([\da-f]{2})?$/i.test(value);
const mix = (a: number, b: number, t: number) => a * (1 - t) + b * t;
const channels = (value: string) =>
  (value.length === 7 ? value + 'ff' : value)
    .slice(1)
    .match(/../g)!
    .map((v) => parseInt(v, 16));

export const propertyInterpolators: Readonly<Record<PropertyTrack['interpolation'], AnimationInterpolator>> = {
  number: { accepts: number, interpolate: (a, b, t) => mix(a as number, b as number, t) },
  color: {
    accepts: color,
    interpolate(a, b, t) {
      const from = channels(a as string),
        to = channels(b as string);
      return (
        '#' +
        from
          .map((v, i) =>
            Math.round(Math.max(0, Math.min(255, mix(v, to[i]!, t))))
              .toString(16)
              .padStart(2, '0'),
          )
          .join('')
      );
    },
  },
  vector: {
    accepts: (value): value is readonly number[] => Array.isArray(value) && value.length > 0 && value.every(number),
    interpolate: (a, b, t) => (a as readonly number[]).map((v, i) => mix(v, (b as readonly number[])[i]!, t)),
  },
  discrete: {
    accepts: (value): value is AnimationValue =>
      number(value) || typeof value === 'boolean' || typeof value === 'string',
    interpolate: (a, b, t) => (t < 1 ? a : b),
  },
};

export function sampleEasing(easing: AnimationEasing = 'linear', t: number): number {
  if (easing === 'linear') return t;
  if (easing === 'ease-in') return t * t;
  if (easing === 'ease-out') return 1 - (1 - t) ** 2;
  if (easing === 'ease-in-out') return t < 0.5 ? 2 * t * t : 1 - 2 * (1 - t) ** 2;
  if ('steps' in easing)
    return Math.min(
      1,
      (easing.position === 'start' ? Math.floor(t * easing.steps) + 1 : Math.floor(t * easing.steps)) / easing.steps,
    );
  if ('spring' in easing) {
    const { damping, frequency } = easing.spring;
    const curve = (x: number) =>
      -Math.expm1(-damping * x) + Math.exp(-damping * x) * 2 * Math.sin((frequency * x) / 2) ** 2;
    return curve(t) / curve(1);
  }
  const [x1, y1, x2, y2] = easing.bezier;
  const curve = (x: number, a: number, b: number) => 3 * (1 - x) ** 2 * x * a + 3 * (1 - x) * x * x * b + x ** 3;
  let low = 0,
    high = 1;
  for (let i = 0; i < 32; i++) {
    const middle = (low + high) / 2;
    if (curve(middle, x1, x2) < t) low = middle;
    else high = middle;
  }
  return curve((low + high) / 2, y1, y2);
}

/** Stateless binary search makes reverse seeks identical to forward playback. */
export function samplePropertyTrack(
  track: PropertyTrack,
  timeMs: number,
  interpolator = propertyInterpolators[track.interpolation],
): AnimationValue {
  if (!Number.isFinite(timeMs)) throw new RangeError('Invalid animation time.');
  const frames = track.keyframes;
  if (!frames.length) throw new Error('Animation track has no keyframes.');
  if (timeMs <= frames[0]!.timeMs) return frames[0]!.value;
  if (timeMs >= frames.at(-1)!.timeMs) return frames.at(-1)!.value;
  let low = 0,
    high = frames.length - 1;
  while (high - low > 1) {
    const mid = (low + high) >>> 1;
    if (frames[mid]!.timeMs <= timeMs) low = mid;
    else high = mid;
  }
  const from = frames[low]!,
    to = frames[high]!;
  return interpolator.interpolate(
    from.value,
    to.value,
    sampleEasing(from.easing, (timeMs - from.timeMs) / (to.timeMs - from.timeMs)),
  );
}
