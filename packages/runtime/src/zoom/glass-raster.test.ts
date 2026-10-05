import { describe, expect, it } from 'vitest';
import { glassRasterSize } from './glass-raster';

describe('lens raster density', () => {
  it.each([1.5, 2.2, 5])('retains magnified detail at %sx', (density) => {
    const result = glassRasterSize(320, 180, density);
    expect(result).toEqual({ width: 320 * Math.ceil(density), height: 180 * Math.ceil(density) });
  });
  it('keeps the same texture dimensions during fractional lens transitions', () => {
    expect(glassRasterSize(1920, 1080, 1.01)).toEqual(glassRasterSize(1920, 1080, 1.99));
  });
  it.each([
    [7680, 4320],
    [4320, 7680],
    [1, 20_000],
  ])('bounds a %sx%s surface without changing its aspect', (w, h) => {
    const result = glassRasterSize(w, h, 10);
    expect(Math.max(result.width, result.height)).toBe(4096);
    expect(result.width * result.height * 4).toBeLessThanOrEqual(64 * 1024 * 1024);
    expect(Math.abs(result.width / result.height - w / h)).toBeLessThan(0.01);
  });
  it.each([0, 0.25, 1])('never reduces an ordinary logical scene at density %s', (density) => {
    expect(glassRasterSize(256, 144, density)).toEqual({ width: 256, height: 144 });
  });
  it.each([
    [0, 10, 1],
    [10, 0, 1],
    [-1, 10, 1],
    [10, 10, -1],
    [NaN, 10, 1],
    [10, Infinity, 1],
    [10, 10, Infinity],
  ])('rejects invalid raster inputs %s,%s,%s', (width, height, density) => {
    expect(() => glassRasterSize(width, height, density)).toThrow(RangeError);
  });
});
