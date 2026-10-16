import type { CursorMotionSample } from './cursor-motion';
import type { CursorExposureSample } from './cursor-exposure-types';

/** Fixed physical exposure: display refresh and export cadence do not retime the cursor. */
export function cursorExposureSamples(options: {
  time: number;
  motion: CursorMotionSample;
  intensity: number;
  width: number;
  height: number;
  resolution: number;
  sourceRate?: number;
  sampleAt(time: number): CursorMotionSample | null;
}): CursorExposureSample[] {
  if (
    ![
      options.time,
      options.intensity,
      options.width,
      options.height,
      options.resolution,
      options.motion.x,
      options.motion.y,
      options.sourceRate ?? 1,
    ].every(Number.isFinite) ||
    options.width <= 0 ||
    options.height <= 0 ||
    options.resolution <= 0 ||
    (options.sourceRate ?? 1) < 0
  )
    throw new RangeError('Invalid cursor exposure geometry.');
  const current = { x: options.motion.x, y: options.motion.y, weight: 1 };
  const intensity = Math.max(0, Math.min(1, options.intensity));
  if (!intensity || options.motion.stopSpringActive || options.sourceRate === 0) return [current];
  const displacement = Math.hypot(
    (current.x - options.motion.previousX) * options.width,
    (current.y - options.motion.previousY) * options.height,
  );
  if (displacement < 1e-8) return [current];
  const exposure = (intensity / 60) * (options.sourceRate ?? 1);
  const previous = options.sampleAt(Math.max(0, options.time - exposure));
  if (!previous?.visible) return [current];
  const distance =
    Math.hypot((current.x - previous.x) * options.width, (current.y - previous.y) * options.height) *
    options.resolution;
  if (distance < 1) return [current];
  const count = Math.min(16, Math.max(2, Math.ceil(distance / 2.5)));
  const weights = Array.from({ length: count }, (_, index) => 0.25 + (0.75 * index) / (count - 1));
  const sum = weights.reduce((total, weight) => total + weight, 0);
  // OpenScreen's native plan interpolates complete previous/current placements over one shutter.
  // Sampling the spring repeatedly inside that interval can fold the trail around a drag transition.
  return weights.map((weight, index) => {
    const t = index / (count - 1);
    return {
      x: previous.x + (current.x - previous.x) * t,
      y: previous.y + (current.y - previous.y) * t,
      weight: weight / sum,
    };
  });
}
