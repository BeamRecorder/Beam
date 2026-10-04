// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { propertyInterpolators, sampleEasing, samplePropertyTrack } from './keyframes';
import type { PropertyTrack } from './scene-types';
const track = (): PropertyTrack => ({
  id: 'a',
  targetId: 'clip',
  property: 'opacity',
  interpolation: 'number',
  keyframes: [
    { timeMs: 10, value: 0 },
    { timeMs: 110, value: 10 },
    { timeMs: 210, value: 0 },
  ],
});
describe('seek-safe property keyframes', () => {
  it('interpolates very large finite values without overflowing the endpoint difference', () => {
    expect(propertyInterpolators.number.interpolate(-1e308, 1e308, 0.5)).toBe(0);
    expect(propertyInterpolators.vector.interpolate([-1e308], [1e308], 0.5)).toEqual([0]);
  });
  it('normalizes almost undamped springs without cancellation producing NaN', () => {
    const easing = { spring: { damping: 1e-100, frequency: 1e-100 } };
    expect(sampleEasing(easing, 0.5)).toBeCloseTo(0.5);
    expect(sampleEasing(easing, 0)).toBe(0);
    expect(sampleEasing(easing, 1)).toBe(1);
  });
  it('clamps endpoints and samples forward and backward identically', () => {
    const value = track();
    expect([0, 10, 60, 110, 160, 210, 300, 60].map((time) => samplePropertyTrack(value, time))).toEqual([
      0, 0, 5, 10, 5, 0, 0, 5,
    ]);
  });
  it('rejects empty tracks and non-finite times', () => {
    expect(() => samplePropertyTrack({ ...track(), keyframes: [] }, 0)).toThrow('no keyframes');
    expect(() => samplePropertyTrack(track(), NaN)).toThrow('time');
    expect(() => samplePropertyTrack(track(), Infinity)).toThrow('time');
  });
  it('supports a trusted custom interpolator without modifying source values', () => {
    expect(
      samplePropertyTrack(track(), 60, { accepts: (v): v is number => typeof v === 'number', interpolate: () => 99 }),
    ).toBe(99);
    expect(track().keyframes[0]!.value).toBe(0);
  });
  it.each(['linear', 'ease-in', 'ease-out', 'ease-in-out'] as const)('samples %s boundaries', (easing) => {
    expect(sampleEasing(easing, 0)).toBe(0);
    expect(sampleEasing(easing, 1)).toBe(1);
    expect(sampleEasing(easing, 0.5)).toBeGreaterThan(0);
  });
  it('samples cubic Bezier, steps and normalized springs', () => {
    expect(sampleEasing({ bezier: [0, 0, 1, 1] }, 0.25)).toBeCloseTo(0.25);
    expect(sampleEasing({ steps: 4, position: 'start' }, 0)).toBe(0.25);
    expect(sampleEasing({ steps: 4, position: 'end' }, 0.49)).toBe(0.25);
    expect(sampleEasing({ steps: 4, position: 'start' }, 1)).toBe(1);
    expect(sampleEasing({ spring: { damping: 8, frequency: 12 } }, 0)).toBe(0);
    expect(sampleEasing({ spring: { damping: 8, frequency: 12 } }, 1)).toBe(1);
  });
  it('interpolates alpha-aware colors, vectors and discrete values', () => {
    expect(propertyInterpolators.color.interpolate('#000000', '#ffffff', 0.5)).toBe('#808080ff');
    expect(propertyInterpolators.color.interpolate('#00000000', '#ffffffff', 0.5)).toBe('#80808080');
    expect(propertyInterpolators.vector.interpolate([1, 2], [3, 4], 0.5)).toEqual([2, 3]);
    expect(propertyInterpolators.discrete.interpolate('a', 'b', 0.9)).toBe('a');
    expect(propertyInterpolators.discrete.interpolate('a', 'b', 1)).toBe('b');
  });
  it.each([null, {}, NaN, Infinity, [], [NaN], 'bad'])('validates interpolator values %j', (value) => {
    expect(propertyInterpolators.number.accepts(value)).toBe(false);
    expect(propertyInterpolators.vector.accepts(value)).toBe(false);
    expect(propertyInterpolators.color.accepts(value)).toBe(false);
  });
  it('accepts numeric, vector, color and discrete values', () => {
    expect(propertyInterpolators.number.accepts(1)).toBe(true);
    expect(propertyInterpolators.vector.accepts([1, 2])).toBe(true);
    expect(propertyInterpolators.color.accepts('#abcdef80')).toBe(true);
    for (const value of [1, true, 'text']) expect(propertyInterpolators.discrete.accepts(value)).toBe(true);
    expect(propertyInterpolators.discrete.accepts({})).toBe(false);
    expect(sampleEasing(undefined, 0.5)).toBe(0.5);
    expect(sampleEasing('ease-in-out', 0.25)).toBe(0.125);
  });
});
