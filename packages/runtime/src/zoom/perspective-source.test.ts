import { expect, it } from 'vitest';
import { perspectiveSourceBounds, perspectiveSourceSize, perspectiveSourceRaster } from './perspective-source';
import { createDefaultClipAppearance } from '@beam/engine/shared/composition-defaults';
import type { VisualClip, Clip } from '@beam/engine/shared/composition-types';
const clip = (patch: Partial<VisualClip> = {}): VisualClip => ({
  id: 'screen',
  assetId: 'source',
  kind: 'screen',
  name: 'Screen',
  timelineStartMs: 0,
  timelineDurationMs: 1000,
  sourceInMs: 0,
  sourceDurationMs: 1000,
  playbackRate: 1,
  enabled: true,
  order: 0,
  transform: { x: 0, y: 0, width: 1, height: 1 },
  isMirrored: false,
  isMirroredY: false,
  appearance: { ...createDefaultClipAppearance('screen'), frame: 'none', shadowSize: 'none', borderEnabled: false },
  ...patch,
});
it('retains the full unzoomed canvas and cursor bleed even without media', () => {
  expect(perspectiveSourceBounds({ width: 400, height: 240 }, [])).toEqual({ x: 0, y: 0, width: 400, height: 240 });
  expect(perspectiveSourceBounds({ width: 400, height: 240 }, [], 1, undefined, 40)).toEqual({
    x: -40,
    y: -40,
    width: 480,
    height: 320,
  });
});
it('includes complete media shadow halos, borders and rotation beyond the canvas', () => {
  const value = clip();
  value.appearance = { ...value.appearance, shadowSize: 'custom', shadowBlur: 24, borderEnabled: true, borderWidth: 3 };
  expect(perspectiveSourceBounds({ width: 400, height: 240 }, [value])).toEqual({
    x: -101,
    y: -101,
    width: 602,
    height: 442,
  });
  const rotated = perspectiveSourceBounds({ width: 400, height: 240 }, [{ ...value, rotation: 90 }]);
  expect(rotated.x).toBeCloseTo(-21, 10);
  expect(rotated.y).toBeCloseTo(-181, 10);
  expect(rotated.width).toBeCloseTo(442, 10);
  expect(rotated.height).toBeCloseTo(602, 10);
});
it('includes frame chrome and transformed parent groups without clipping their shadows', () => {
  const value = clip();
  value.appearance.frame = 'safari';
  const bounds = perspectiveSourceBounds({ width: 400, height: 240 }, [value], 1, {
    version: 1,
    roots: ['g'],
    groups: [
      {
        id: 'g',
        children: ['screen'],
        opacity: 0.5,
        blendMode: 'source-over',
        space: 'scene',
        transform: { x: 0.5, y: 0, rotation: 0, scaleX: 2, scaleY: 2 },
      },
    ],
  });
  expect(bounds.x).toBeCloseTo(-4, 10);
  expect(bounds.width).toBeCloseTo(808, 10);
  expect(bounds.y).toBeCloseTo(-124, 10);
  expect(bounds.height).toBeCloseTo(488, 10);
});
it('includes shape strokes and directional shadow bleed while ignoring nonvisual timing records', () => {
  const shape = {
    ...clip(),
    kind: 'shape',
    rotation: 0,
    shadowEnabled: true,
    shadowBlur: 54,
    borderWidth: 5,
  } as unknown as Clip;
  const bounds = perspectiveSourceBounds({ width: 1080, height: 1080 }, [
    shape,
    { id: 'sound', kind: 'audio' } as Clip,
  ]);
  expect(bounds.x).toBe(-223);
  expect(bounds.width).toBe(1526);
});
it.each([
  { width: 1920, height: 1080 },
  { width: 7680, height: 4320 },
  { width: 100000, height: 10 },
  { width: 10, height: 100000 },
])('bounds source textures without discarding scene edges: %o', (bounds) => {
  for (const maximum of [2048, 4096, 16384]) {
    const size = perspectiveSourceSize({ x: -100, y: -100, ...bounds }, 2, maximum);
    expect(size.width).toBeGreaterThan(0);
    expect(size.height).toBeGreaterThan(0);
    expect(size.width).toBeLessThanOrEqual(maximum);
    expect(size.height).toBeLessThanOrEqual(maximum);
    expect(size.width * size.height * 4).toBeLessThanOrEqual(64 * 1024 * 1024);
  }
});
it.each([{ width: 0 }, { height: -1 }, { width: NaN }, { height: Infinity }, { x: NaN }])(
  'rejects invalid texture source bounds %o',
  (patch) => {
    expect(() => perspectiveSourceSize({ x: 0, y: 0, width: 400, height: 240, ...patch }, 1, 8192)).toThrow(RangeError);
  },
);
it('retains exact dimensions within budget and rejects invalid raster limits', () => {
  expect(perspectiveSourceSize({ x: -10, y: 20, width: 400, height: 240 }, 1, 8192)).toEqual({
    width: 400,
    height: 240,
  });
  for (const scale of [0, NaN, Infinity])
    expect(() => perspectiveSourceSize({ x: 0, y: 0, width: 400, height: 240 }, scale, 8192)).toThrow(RangeError);
  expect(() => perspectiveSourceSize({ x: 0, y: 0, width: 400, height: 240 }, 1, 0)).toThrow(RangeError);
});

it.each([1.25, 1.8, 3.5])(
  'keeps exact %sx raster density and camera pixel phase through repeated screenshot captures',
  (scale) => {
    const source = { x: -2, y: -2, width: 404, height: 244 },
      viewport = { x: 0, y: 0, width: 400, height: 240 },
      camera = { scale, focusX: 0.371, focusY: 0.629 };
    const plan = perspectiveSourceRaster(source, viewport, camera, 1, 8192);
    expect(plan.size.width / plan.bounds.width).toBeCloseTo(scale, 12);
    expect(plan.size.height / plan.bounds.height).toBeCloseTo(scale, 12);
    expect(plan.bounds.x).toBeLessThanOrEqual(source.x + 1e-8);
    expect(plan.bounds.y).toBeLessThanOrEqual(source.y + 1e-8);
    expect(plan.bounds.x + plan.bounds.width).toBeGreaterThanOrEqual(source.x + source.width - 1e-8);
    const phase = viewport.width / 2 - camera.focusX * viewport.width * scale;
    expect(plan.bounds.x * scale + phase).toBeCloseTo(Math.round(plan.bounds.x * scale + phase), 10);
    const again = perspectiveSourceRaster(plan.bounds, viewport, camera, 1, 8192);
    expect(again.size).toEqual(plan.size);
    expect(again.bounds.x).toBeCloseTo(plan.bounds.x, 10);
  },
);
it.each([
  { width: 1920, height: 1080 },
  { width: 7680, height: 4320 },
  { width: 100000, height: 10 },
  { width: 10, height: 100000 },
])('retains the complete source within texture and memory limits after outward rounding: %o', (dimensions) => {
  const bounds = { x: -101.3, y: -79.1, ...dimensions };
  for (const maxSize of [2048, 4096, 16384]) {
    const plan = perspectiveSourceRaster(
      bounds,
      { x: 10.3, y: 20.7, ...dimensions },
      { scale: 5, focusX: 0.37, focusY: 0.6 },
      1,
      maxSize,
    );
    expect(plan.size.width).toBeLessThanOrEqual(maxSize);
    expect(plan.size.height).toBeLessThanOrEqual(maxSize);
    expect(plan.size.width * plan.size.height * 4).toBeLessThanOrEqual(64 * 1024 * 1024);
    expect(plan.bounds.x).toBeLessThanOrEqual(bounds.x + 1e-6);
    expect(plan.bounds.y).toBeLessThanOrEqual(bounds.y + 1e-6);
    expect(plan.bounds.x + plan.bounds.width).toBeGreaterThanOrEqual(bounds.x + bounds.width - 1e-6);
    expect(plan.bounds.y + plan.bounds.height).toBeGreaterThanOrEqual(bounds.y + bounds.height - 1e-6);
  }
});
it('rejects invalid cameras, tiny GPUs and overflowing geometry before allocation', () => {
  const bounds = { x: 0, y: 0, width: 400, height: 240 },
    camera = { scale: 1.25, focusX: 0.5, focusY: 0.5 };
  for (const patch of [{ scale: 0 }, { scale: NaN }, { focusX: Infinity }])
    expect(() => perspectiveSourceRaster(bounds, bounds, { ...camera, ...patch }, 1, 8192)).toThrow(RangeError);
  expect(() => perspectiveSourceRaster(bounds, { ...bounds, width: 0 }, camera, 1, 8192)).toThrow(RangeError);
  expect(() => perspectiveSourceRaster(bounds, bounds, camera, 1, 2)).toThrow(RangeError);
  expect(() => perspectiveSourceRaster({ ...bounds, width: 1e300, height: 1e300 }, bounds, camera, 1, 8192)).toThrow(
    RangeError,
  );
});
