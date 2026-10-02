import { describe, expect, it } from 'vitest';
import { createBeamyLoadingMotion } from './beamy-loading-motion';

describe('Beamy loading choreography', () => {
  it('shows loading dots immediately and keeps them until three seconds', () => {
    const sample = createBeamyLoadingMotion();
    for (const time of [0, 0.1, 1, 2.999]) {
      expect(sample(time).eyes).toHaveLength(0);
      expect(sample(time).dots).toHaveLength(2);
    }
  });
  it('briefly morphs into the triangle and returns to dancing dots', () => {
    const sample = createBeamyLoadingMotion();
    const frames = Array.from({ length: 105 }, (_, index) => sample(index / 10));
    expect(new Set(frames.map((frame) => frame.bodyPath)).size).toBeGreaterThan(10);
    expect(frames.some((frame) => frame.dots.length === 2 && frame.eyes.length === 0)).toBe(true);
    expect(frames.some((frame) => frame.eyes.length === 2)).toBe(true);
    expect(frames.every((frame) => !frame.bodyPath.match(/NaN|Infinity/))).toBe(true);
  });
  it('keeps both transitions continuous and resumes the dots without another large shape', () => {
    const sample = createBeamyLoadingMotion();
    const coordinates = (time: number) =>
      sample(time)
        .bodyPath.match(/-?\d+(?:\.\d+)?/g)!
        .map(Number);
    for (const boundary of [3, 4.2]) {
      const before = coordinates(boundary - 0.00001);
      const after = coordinates(boundary + 0.00001);
      expect(Math.max(...before.map((point, index) => Math.abs(point - after[index]!)))).toBeLessThanOrEqual(
        0.02 + 1e-10,
      );
    }
    for (const time of [5, 10, 100]) expect(sample(time).eyes).toHaveLength(0);
    expect(sample(6).dots).not.toEqual(sample(6.4).dots);
  });
  it('supports arbitrary repeated seeks without leaking previous transitions', () => {
    const sample = createBeamyLoadingMotion();
    for (const time of [3, 0, 5, 1, 10, 0.8, 9.6]) {
      expect(sample(time)).toEqual(createBeamyLoadingMotion()(time));
    }
  });
  it.each([NaN, Infinity, -Infinity, -1])('normalizes invalid clock values %s', (time) => {
    const sample = createBeamyLoadingMotion();
    sample(5);
    expect(sample(time)).toEqual(sample(0));
  });
});
