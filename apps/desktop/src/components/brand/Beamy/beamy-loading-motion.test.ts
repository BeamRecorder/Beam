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

it('moves the triangle gaze visibly and blinks before the dots resume', () => {
  const sample = createBeamyLoadingMotion();
  const matrix = (time: number) =>
    sample(time)
      .eyes[0]!.matrix.match(/-?\d+(?:\.\d+)?/g)!
      .map(Number);
  const before = matrix(3.55),
    closed = matrix(3.7),
    reopened = matrix(3.85);
  expect(Math.abs(closed[3]!)).toBeLessThan(Math.abs(before[3]!) / 10);
  expect(Math.abs(reopened[3]!)).toBeGreaterThan(Math.abs(closed[3]!) * 10);
  expect(Math.abs(matrix(3.45)[4]! - matrix(4.1)[4]!)).toBeGreaterThan(4);
  expect(sample(3.7).eyes.every((eye) => eye.alpha === 1)).toBe(true);
  expect(sample(3.7).dots).toHaveLength(0);
});
it('replays triangle eye movement and blinking identically after forward and backward seeks', () => {
  const sample = createBeamyLoadingMotion();
  for (const time of [3.7, 5, 3.55, 0, 3.85, 100, 3.7]) expect(sample(time)).toEqual(createBeamyLoadingMotion()(time));
});
