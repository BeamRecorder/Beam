import { describe, expect, it } from 'vitest';
import { createZoomMotionBlurSamplePlan } from '../zoom-motion-blur';

const camera = (focusX: number, focusY: number, scale: number) => ({ focusX, focusY, scale });

describe('zoom motion-blur sample plan', () => {
  it('collapses an idle camera or zero intensity to one fully weighted sample', () => {
    const current = camera(0.5, 0.5, 1.5);

    expect(
      createZoomMotionBlurSamplePlan({
        previous: current,
        current,
        intensity: 0.8,
        deltaMs: 16,
      }),
    ).toEqual([{ camera: current, weight: 1 }]);

    expect(
      createZoomMotionBlurSamplePlan({
        previous: camera(0.2, 0.8, 1.1),
        center: camera(0.45, 0.55, 1.4),
        current,
        intensity: 0,
        deltaMs: 16,
      }),
    ).toEqual([{ camera: camera(0.45, 0.55, 1.4), weight: 1 }]);
  });

  it('creates a symmetric moving-camera kernel with normalized weights', () => {
    const samples = createZoomMotionBlurSamplePlan({
      previous: camera(0.2, 0.8, 1.1),
      current: camera(0.8, 0.2, 1.8),
      intensity: 1,
      deltaMs: 16,
      sampleCount: 5,
    });

    expect(samples.length).toBeGreaterThanOrEqual(3);
    expect(samples.length).toBeLessThanOrEqual(5);
    expect(samples.map(({ weight }) => weight)).toEqual([...samples].reverse().map(({ weight }) => weight));
    expect(samples.reduce((total, { weight }) => total + weight, 0)).toBeCloseTo(1, 12);
    expect(samples[0]?.camera).not.toEqual(samples.at(-1)?.camera);
  });

  it('is deterministic and bounded at temporal and intensity edges', () => {
    const input = {
      previous: camera(0.2, 0.8, 1.1),
      current: camera(0.8, 0.2, 1.8),
      intensity: 4,
      deltaMs: -16,
      sampleCount: 99,
    };

    const first = createZoomMotionBlurSamplePlan(input);
    const second = createZoomMotionBlurSamplePlan(input);

    expect(first).toEqual(second);
    expect(first.length).toBeGreaterThanOrEqual(1);
    expect(first.length).toBeLessThanOrEqual(5);
    expect(first.every(({ weight }) => weight >= 0 && weight <= 1)).toBe(true);
    expect(first.reduce((total, { weight }) => total + weight, 0)).toBeCloseTo(1, 12);
  });
});
