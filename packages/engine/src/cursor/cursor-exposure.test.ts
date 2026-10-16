import { expect, it } from 'vitest';
import { cursorExposureSamples } from './cursor-exposure';
import type { CursorMotionSample } from './cursor-motion';
const motion = (t: number): CursorMotionSample => ({
  x: t,
  y: t * t,
  previousX: t - 0.01,
  previousY: t * t - 0.01,
  deltaSeconds: 1 / 120,
  stopSpringActive: false,
  visible: true,
  cursorId: null,
  shapeId: null,
  cursorKind: null,
  hotspot: { x: 0, y: 0 },
});
const options = {
  time: 0.5,
  motion: motion(0.5),
  intensity: 1,
  width: 1920,
  height: 1080,
  resolution: 1,
  sampleAt: motion,
};
it('scales the physical shutter through playback speed and keeps frozen frames crisp', () => {
  const double = cursorExposureSamples({ ...options, sourceRate: 2 });
  expect(double[0]!.x).toBeCloseTo(0.5 - 2 / 60, 12);
  expect(
    cursorExposureSamples({
      ...options,
      sourceRate: 0,
      sampleAt: () => {
        throw new Error('frozen');
      },
    }),
  ).toEqual([{ x: 0.5, y: 0.25, weight: 1 }]);
  expect(() => cursorExposureSamples({ ...options, sourceRate: -1 })).toThrow(RangeError);
});
it('uses a fixed exposure independent of sampling order and display cadence', () => {
  const samples = cursorExposureSamples(options);
  expect(samples[0]!.x).toBeCloseTo(0.5 - 1 / 60, 12);
  expect(samples.at(-1)!.x).toBe(0.5);
  expect(samples.reduce((sum, p) => sum + p.weight, 0)).toBeCloseTo(1, 12);
  cursorExposureSamples({ ...options, time: 30 });
  expect(cursorExposureSamples(options)).toEqual(samples);
  const first = samples[0]!,
    last = samples.at(-1)!;
  for (const [index, sample] of samples.entries())
    expect(sample.y).toBeCloseTo(first.y + ((last.y - first.y) * index) / (samples.length - 1), 12);
});
it.each([0, -1])('disables exposure at intensity %s', (intensity) => {
  expect(cursorExposureSamples({ ...options, intensity })).toEqual([{ x: 0.5, y: 0.25, weight: 1 }]);
});
it('clamps intensity and caps extreme travel at sixteen samples', () => {
  expect(cursorExposureSamples({ ...options, intensity: 100, width: 100000 })).toHaveLength(16);
  expect(cursorExposureSamples({ ...options, intensity: 100 })).toEqual(cursorExposureSamples(options));
});
it('keeps stationary, settling and subpixel motion crisp', () => {
  for (const patch of [
    { sampleAt: () => motion(0.5) },
    { motion: { ...options.motion, stopSpringActive: true } },
    { width: 1, height: 1 },
  ])
    expect(cursorExposureSamples({ ...options, ...patch })).toHaveLength(1);
});
it('never paints positions from a hidden interval before reappearance', () => {
  expect(cursorExposureSamples({ ...options, sampleAt: () => ({ ...motion(0), visible: false }) })).toEqual([
    { x: 0.5, y: 0.25, weight: 1 },
  ]);
  expect(cursorExposureSamples({ ...options, sampleAt: () => null })).toEqual([{ x: 0.5, y: 0.25, weight: 1 }]);
});
it('uses the two shutter endpoints without repeatedly sampling a spring and clamps pre-roll', () => {
  const queries: number[] = [];
  cursorExposureSamples({
    ...options,
    sampleAt: (t) => {
      queries.push(t);
      return motion(t);
    },
  });
  expect(queries).toEqual([0.5 - 1 / 60]);
  expect(cursorExposureSamples({ ...options, time: 0.001, motion: motion(0.001) })[0]!.x).toBe(0);
});
it.each([
  { intensity: NaN },
  { time: Infinity },
  { width: 0 },
  { height: -1 },
  { resolution: 0 },
  { motion: { ...options.motion, x: NaN } },
])('rejects invalid geometry %o', (patch) => {
  expect(() => cursorExposureSamples({ ...options, ...patch })).toThrow(RangeError);
});
