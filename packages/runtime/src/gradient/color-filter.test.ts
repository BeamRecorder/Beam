import { it, expect } from 'vitest';
import { DEFAULT_COLOR_RECIPE } from '@beam/engine';
import { colorAdjustmentFilter } from './color-filter';
it('keeps neutral adjustments neutral without an alpha filter', () => {
  expect(colorAdjustmentFilter(DEFAULT_COLOR_RECIPE)).toBe(
    'hue-rotate(0deg) saturate(100%) brightness(100%) contrast(100%) grayscale(0%) sepia(0%) invert(0%)',
  );
});
it('serializes all operations in the documented order', () => {
  expect(
    colorAdjustmentFilter({
      version: 1,
      hue: -42,
      saturation: 80,
      brightness: 120,
      contrast: 90,
      grayscale: 70,
      sepia: 25,
      invert: 10,
    }),
  ).toBe('hue-rotate(-42deg) saturate(80%) brightness(120%) contrast(90%) grayscale(70%) sepia(25%) invert(10%)');
});
it('supports complete monochrome and inversion at their bounds', () => {
  expect(colorAdjustmentFilter({ ...DEFAULT_COLOR_RECIPE, hue: 180, grayscale: 100, invert: 100 })).toContain(
    'grayscale(100%) sepia(0%) invert(100%)',
  );
});
