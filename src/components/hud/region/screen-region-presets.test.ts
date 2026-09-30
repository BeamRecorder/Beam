import { expect, it } from 'vitest';
import { computePresetRegion, findMatchingPreset } from './screen-region-presets';
const bounds = { x: -1920, y: 0, width: 1920, height: 1080 };
it('selects exact fullscreen regardless of the previous crop or monitor position', () => {
  for (const current of [null, { x: 0.4, y: 0.2, width: 0.2, height: 0.5 }])
    expect(computePresetRegion('fullscreen', bounds, current, false)).toEqual({ x: 0, y: 0, width: 1, height: 1 });
});
it('centers fixed sizes in the current crop and clamps against the display', () => {
  expect(computePresetRegion('640x480', bounds, { x: 0.9, y: 0.8, width: 0.1, height: 0.2 }, false)).toEqual({
    x: 1 - 640 / 1920,
    y: 1 - 480 / 1080,
    width: 640 / 1920,
    height: 480 / 1080,
  });
  expect(computePresetRegion('640x480', { ...bounds, width: 10, height: 10 }, null, true)).toEqual({
    x: 0,
    y: 0,
    width: 1,
    height: 1,
  });
  expect(computePresetRegion('invalid', bounds, null, true)).toBeNull();
});
it('recognizes fullscreen only for the whole monitor, and fixed sizes within tolerance', () => {
  expect(findMatchingPreset({ x: 0, y: 0, width: 1, height: 1 }, bounds)).toBe('fullscreen');
  expect(findMatchingPreset(null, bounds)).toBeNull();
  expect(findMatchingPreset({ x: 0, y: 0, width: 0.98, height: 1 }, bounds)).toBeNull();
  expect(findMatchingPreset({ x: 0.1, y: 0.1, width: 641 / 1920, height: 479 / 1080 }, bounds)).toBe('640x480');
});
