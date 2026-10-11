import { it, expect } from 'vitest';
import { jarvisDither } from './jarvis-dithering';
import { DEFAULT_DITHERING_RECIPE } from '@beam/engine';
const image = (w: number, h: number, alpha = 255) => {
  const pixels = new Uint8ClampedArray(w * h * 4);
  for (let i = 0; i < pixels.length; i += 4) pixels.set([188, 188, 188, alpha], i);
  return pixels;
};
it('diffuses a near-half linear luminance into a balanced, deterministic two-color pattern', () => {
  const pixels = image(64, 64),
    other = pixels.slice();
  jarvisDither(pixels, 64, 64, DEFAULT_DITHERING_RECIPE);
  jarvisDither(other, 64, 64, DEFAULT_DITHERING_RECIPE);
  expect(pixels).toEqual(other);
  const white = Array.from(pixels).filter((v, i) => i % 4 === 0 && v === 255).length;
  expect(white / 4096).toBeGreaterThan(0.47);
  expect(white / 4096).toBeLessThan(0.54);
  expect(pixels.every((v, i) => (i % 4 === 3 ? v === 255 : v === 0 || v === 255))).toBe(true);
});
it('retains the exact alpha of transparent and partially transparent edges, including block centers', () => {
  const pixels = image(5, 5, 64);
  for (let i = 0; i < 5; i++) pixels[(i * 5 + i) * 4 + 3] = 0;
  const before = pixels.slice();
  jarvisDither(pixels, 5, 5, { ...DEFAULT_DITHERING_RECIPE, blockSize: 2 });
  for (let i = 0; i < pixels.length; i += 4) {
    expect(pixels[i + 3]).toBe(before[i + 3]);
    if (!pixels[i + 3]) expect(pixels.slice(i, i + 4)).toEqual(before.slice(i, i + 4));
  }
  const empty = image(3, 3, 0);
  jarvisDither(empty, 3, 3, { ...DEFAULT_DITHERING_RECIPE, blockSize: 2 });
  expect(empty).toEqual(image(3, 3, 0));
});
it('supports ordered luminance palettes, repeated colors and source adjustments', () => {
  const pixels = image(8, 8);
  jarvisDither(pixels, 8, 8, {
    ...DEFAULT_DITHERING_RECIPE,
    mapping: 'luminance',
    colors: ['#f00', '#00f'],
    brightness: 0,
  });
  expect(Array.from(pixels.slice(0, 4))).toEqual([255, 0, 0, 255]);
  const repeated = image(4, 4);
  jarvisDither(repeated, 4, 4, { ...DEFAULT_DITHERING_RECIPE, colors: ['#abc', '#abc'], contrast: 0 });
  expect(Array.from(repeated.slice(0, 4))).toEqual([170, 187, 204, 255]);
});
it('rejects invalid dimensions, recipes and pixel scales before allocating buffers', () => {
  for (const [w, h, scale] of [
    [0, 1, 1],
    [1, 0, 1],
    [1.5, 1, 1],
    [1, 1, 0],
    [1, 1, Infinity],
  ])
    expect(() => jarvisDither(image(1, 1), w!, h!, DEFAULT_DITHERING_RECIPE, scale)).toThrow('surface');
  expect(() => jarvisDither(image(1, 1), 2, 2, DEFAULT_DITHERING_RECIPE)).toThrow('surface');
  expect(() => jarvisDither(image(1, 1), 1, 1, { ...DEFAULT_DITHERING_RECIPE, blockSize: 0 })).toThrow('recipe');
});
