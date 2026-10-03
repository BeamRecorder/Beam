import { expect, it } from 'vitest';
import { screenshotExportRasterScale } from '../screenshot-export-raster';
import { stateFixture } from './export-test-support';

it('keeps two original samples per output pixel without upscaling small sources', () => {
  const state = stateFixture();
  expect(screenshotExportRasterScale(state, 'source', 'source', { width: 6000, height: 3000 })).toBeCloseTo(1 / 3);
  expect(screenshotExportRasterScale(state, 'source', 'source', { width: 800, height: 400 })).toBe(1);
});
it('retains the full original when a tight crop needs that detail', () => {
  const state = stateFixture();
  state.image.crop = { x: 0.4, y: 0.4, width: 0.1, height: 0.1 };
  expect(screenshotExportRasterScale(state, 'source', 'source', { width: 6000, height: 3000 })).toBe(1);
});
it('uses the most demanding visible instance when several layers share one image', () => {
  const state = stateFixture();
  state.images = [0.05, 0.5, 1].map((size, index) => ({
    ...state.image,
    kind: 'image' as const,
    id: String(index),
    source: 'shared',
    width: 6000,
    height: 3000,
    enabled: index !== 2,
    transform: { x: 0, y: 0, width: size, height: size },
  }));
  expect(screenshotExportRasterScale(state, 'source', 'shared', { width: 6000, height: 3000 })).toBeCloseTo(1 / 6);
});
it('sizes a visible background for cover rather than a foreground layer', () => {
  const state = stateFixture();
  state.canvas.showBackground = true;
  state.background = { kind: 'image', id: 'back', name: 'Back', path: 'back', extension: 'webp' };
  expect(screenshotExportRasterScale(state, 'source', 'back', { width: 6000, height: 6000 })).toBeCloseTo(1 / 3);
  state.canvas.showBackground = false;
  expect(screenshotExportRasterScale(state, 'source', 'back', { width: 6000, height: 6000 })).toBe(0);
});
it('does not reserve a full-resolution raster for an unrelated or disabled layer', () => {
  const state = stateFixture();
  expect(screenshotExportRasterScale(state, 'source', 'missing', { width: 6000, height: 3000 })).toBe(0);
  state.image.enabled = false;
  expect(screenshotExportRasterScale(state, 'source', 'source', { width: 6000, height: 3000 })).toBe(0);
});
