import { describe, expect, it } from 'vitest';
import { cursorRippleAt } from '../cursor-ripple';

describe('cursor ripple shapes', () => {
  it('renders one outline ring for the single shape and keeps the legacy default', () => {
    const single = cursorRippleAt(0.2, 40, 'single');
    const legacy = cursorRippleAt(0.2, 40);

    expect(single?.rings).toEqual([{ radius: expect.any(Number), opacity: expect.any(Number), filled: false }]);
    expect(legacy).toEqual(single);
  });

  it('renders a second staggered outline ring for the double shape', () => {
    expect(cursorRippleAt(0.05, 40, 'double')?.rings).toHaveLength(1);
    const double = cursorRippleAt(0.2, 40, 'double');

    expect(double?.rings).toHaveLength(2);
    expect(double?.rings.every((ring) => ring.filled !== true)).toBe(true);
    expect(double?.rings[1]?.radius).toBeLessThan(double?.rings[0]?.radius ?? Infinity);
    expect(double?.rings[1]?.opacity).toBeGreaterThan(0);
    expect(double?.rings[1]?.opacity).toBeLessThanOrEqual(1);
  });

  it('renders an outline and a filled core for the solid shape', () => {
    const solid = cursorRippleAt(0.1, 40, 'solid');

    expect(solid?.rings).toHaveLength(2);
    expect(solid?.rings[0]?.filled).toBe(false);
    expect(solid?.rings[1]?.filled).toBe(true);
    expect(solid?.rings[1]?.radius).toBeLessThan(solid?.rings[0]?.radius ?? Infinity);
  });

  it('renders no sample for the none shape and after the animation window', () => {
    expect(cursorRippleAt(0.2, 40, 'none')).toBeNull();
    expect(cursorRippleAt(0.501, 40, 'single')).toBeNull();
  });
});
