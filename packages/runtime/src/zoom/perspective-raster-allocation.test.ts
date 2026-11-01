import { expect, it } from 'vitest';
import { perspectiveSourceRaster } from './perspective-source';

const viewport = { x: 0, y: 0, width: 1920, height: 1080 };

it.each([1.25, 1.8, 3, 5])('keeps one allocation throughout a 48-frame pan at %sx zoom', (scale) => {
  const sizes = new Set<string>();
  for (let frame = 0; frame < 48; frame++) {
    const raster = perspectiveSourceRaster(
      viewport,
      viewport,
      { scale, focusX: 0.45 + frame / 470, focusY: 0.4 + frame / 530 },
      1,
      16384,
      'stable',
    );
    sizes.add(`${raster.size.width}x${raster.size.height}`);
  }
  expect(sizes.size).toBe(1);
});

it.each([1, 1.25])(
  'reserves only transparent edge space without changing density or pixel phase at DPR %s',
  (pixelScale) => {
    const bounds = { x: -101.3, y: -79.1, width: 2122.6, height: 1238.2 },
      output = { ...viewport, x: 10.3, y: 20.7 };
    for (const scale of [1.25, 3, 5])
      for (const focus of [-0.1, 0.371, 0.5, 1.1]) {
        const camera = { scale, focusX: focus, focusY: 1 - focus },
          tight = perspectiveSourceRaster(bounds, output, camera, pixelScale, 16384),
          stable = perspectiveSourceRaster(bounds, output, camera, pixelScale, 16384, 'stable');
        expect(stable.bounds.x).toBe(tight.bounds.x);
        expect(stable.bounds.y).toBe(tight.bounds.y);
        for (const axis of ['width', 'height'] as const) {
          expect(stable.size[axis] - tight.size[axis]).toBeGreaterThanOrEqual(0);
          expect(stable.size[axis] - tight.size[axis]).toBeLessThanOrEqual(1);
          expect(stable.size[axis] / stable.bounds[axis]).toBeCloseTo(tight.size[axis] / tight.bounds[axis], 12);
        }
        const density = stable.size.width / stable.bounds.width,
          phaseX = (output.width / 2 - (output.x + camera.focusX * output.width) * scale) * pixelScale,
          phaseY = (output.height / 2 - (output.y + camera.focusY * output.height) * scale) * pixelScale;
        expect(stable.bounds.x * density + phaseX).toBeCloseTo(Math.round(stable.bounds.x * density + phaseX), 8);
        expect(stable.bounds.y * density + phaseY).toBeCloseTo(Math.round(stable.bounds.y * density + phaseY), 8);
      }
  },
);

it.each([
  { width: 1920, height: 1080 },
  { width: 7680, height: 4320 },
  { width: 100000, height: 10 },
  { width: 10, height: 100000 },
])('keeps stable allocations inside memory and GPU limits, including extreme aspect ratios: %o', (dimensions) => {
  const bounds = { x: -101.3, y: -79.1, ...dimensions };
  for (const maxSize of [3, 2048, 4096, 16384])
    for (const focus of [0, 0.371, 0.5, 1]) {
      const plan = perspectiveSourceRaster(
        bounds,
        viewport,
        { scale: 5, focusX: focus, focusY: 1 - focus },
        1.25,
        maxSize,
        'stable',
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

it('still adapts allocations to actual zoom, output density and scene extent changes', () => {
  const camera = { scale: 1.25, focusX: 0.371, focusY: 0.629 },
    initial = perspectiveSourceRaster(viewport, viewport, camera, 1, 16384, 'stable'),
    zoomed = perspectiveSourceRaster(viewport, viewport, { ...camera, scale: 2 }, 1, 16384, 'stable'),
    highDpi = perspectiveSourceRaster(viewport, viewport, camera, 1.25, 16384, 'stable'),
    expanded = perspectiveSourceRaster({ ...viewport, width: 2200 }, viewport, camera, 1, 16384, 'stable');
  expect(zoomed.size.width).toBeGreaterThan(initial.size.width);
  expect(highDpi.size.width).toBeGreaterThan(initial.size.width);
  expect(expanded.size.width).toBeGreaterThan(initial.size.width);
  expect(perspectiveSourceRaster(viewport, viewport, camera, 1, 16384, 'stable')).toEqual(initial);
});
