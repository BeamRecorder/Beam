import { describe, it, expect } from 'vitest';
import { gradientProjection } from './gradient-projection';
import { toOklab } from './gradient-color';
const identity = { a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 };
describe('local gradient projection', () => {
  it('maps each object corner into its own normalized frame', () => {
    const p = gradientProjection({ x: 10, y: 20, width: 100, height: 50 }, identity);
    const at = (x: number, y: number) => [p.x[0] * x + p.x[1] * y + p.x[2], p.y[0] * x + p.y[1] * y + p.y[2]];
    expect(at(10, 20)).toEqual([0, 0]);
    expect(at(110, 70)).toEqual([1, 1]);
  });
  it('follows a rotated object and the canvas thumbnail translation/scale', () => {
    const p = gradientProjection(
      { x: 0, y: 0, width: 100, height: 50, rotation: 90 },
      { a: 2, b: 0, c: 0, d: 2, e: 8, f: 12 },
    );
    const x = 158,
      y = -38;
    expect(p.x[0] * x + p.x[1] * y + p.x[2]).toBeCloseTo(0);
    expect(p.y[0] * x + p.y[1] * y + p.y[2]).toBeCloseTo(0);
  });
  it('rejects collapsed, non-finite or singular geometry', () => {
    for (const width of [0, NaN, Infinity])
      expect(() => gradientProjection({ x: 0, y: 0, width, height: 50 }, identity)).toThrow();
    expect(() => gradientProjection({ x: 0, y: 0, width: 100, height: 50 }, { ...identity, a: 0 })).toThrow();
  });
});
describe('BEBE-ui perceptual palette', () => {
  it('converts black and white without gamma-encoded interpolation', () => {
    expect(toOklab('#000')).toEqual([0, 0, 0]);
    expect(toOklab('#fff')[0]).toBeCloseTo(1, 6);
  });
  it('converts red with the same Oklab coefficients and supports short hex', () => {
    const red = toOklab('#ff0000');
    expect(red[0]).toBeCloseTo(0.627955, 6);
    expect(red[1]).toBeCloseTo(0.224863, 6);
    expect(toOklab('#f00')).toEqual(red);
  });
  it('rejects named colors and alpha instead of silently changing the palette', () => {
    for (const value of ['red', '#ffffff00', '#12', 'rgb(1,2,3)']) expect(() => toOklab(value)).toThrow();
  });
});
