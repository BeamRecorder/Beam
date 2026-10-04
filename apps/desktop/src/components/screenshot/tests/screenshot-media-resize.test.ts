import { expect, it } from 'vitest';
import { anchorScreenshotResize } from '../screenshot-media-resize';
import { createStillDocument } from '@beam/engine/screenshot/still-document';
import type { ScreenshotRenderAssets } from '@beam/runtime/screenshot/screenshot-types';
const state = () => {
  const value = createStillDocument('screen', 'source.png', 1000, 500).state;
  value.image.transform = { x: 0.1, y: 0.2, width: 0.4, height: 0.4 };
  return value;
};
const resized = { x: 0.1, y: 0.2, width: 0.6, height: 0.6 };
it('retains a non-rotated resize and a missing layer without copying the authored transform', () => {
  const value = state();
  expect(anchorScreenshotResize(value, 'image', resized, null)).toBe(resized);
  expect(anchorScreenshotResize(value, 'missing', resized, null)).toBe(resized);
});
it('anchors a rotated image against its previous opposite corner without touching the source', () => {
  const value = state();
  value.image.rotation = 90;
  const result = anchorScreenshotResize(value, 'image', resized, null);
  expect(result.x).toBeCloseTo(-0.05);
  expect(result.y).toBeCloseTo(0.3);
  expect(result).toMatchObject({ width: 0.6, height: 0.6 });
  expect(value.image.transform).toEqual({ x: 0.1, y: 0.2, width: 0.4, height: 0.4 });
});
it('accounts for the actual framed and cropped image geometry when resources are present', () => {
  const value = state();
  value.image.rotation = 180;
  value.image.crop = { x: 0.1, y: 0.1, width: 0.5, height: 0.5 };
  const assets = {
    width: 1000,
    height: 500,
    image: {} as CanvasImageSource,
    background: null,
    logo: null,
    cursors: new Map(),
  } satisfies ScreenshotRenderAssets;
  const result = anchorScreenshotResize(value, 'image', resized, assets);
  expect(result.width).toBe(0.6);
  expect(result.height).toBe(0.6);
  expect(result.x).toBeLessThan(resized.x);
  expect(result.y).toBeLessThan(resized.y);
});
it('leaves a rotated cursor resize intact until its asset is available', () => {
  const value = state();
  value.cursors = [{ id: 'cursor', rotation: 90 }] as typeof value.cursors;
  expect(anchorScreenshotResize(value, 'cursor', resized, null)).toBe(resized);
});
