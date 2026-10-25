import { afterEach, expect, it, vi } from 'vitest';
import { renderPerspectiveLayers, renderPerspectiveSamples, disposePerspectiveRenderer } from '../perspective-render';
import type { Canvas2DContext } from '../../canvas-types';
const gpu = vi.hoisted(() => ({ constructed: vi.fn(), render: vi.fn(), renderSamples: vi.fn(), dispose: vi.fn() }));
vi.mock('@beam/runtime/zoom/perspective-scene-compositor', () => ({
  PerspectiveSceneCompositor: class {
    constructor() {
      gpu.constructed();
    }
    render = gpu.render;
    renderSamples = gpu.renderSamples;
    dispose = gpu.dispose;
  },
}));
afterEach(() => {
  disposePerspectiveRenderer();
  vi.resetAllMocks();
});
const target = {} as Canvas2DContext,
  sourceBounds = { x: -10, y: -20, width: 420, height: 280 };
const samples = [0.25, 0.5, 0.25].map((weight, i) => ({
  weight,
  camera: {
    scale: 1.25 + i * 0.01,
    focusX: 0.5,
    focusY: 0.5,
    tiltX: 0.1,
    tiltY: -0.2,
    orbit: { azimuth: 0.2, elevation: 0.1, distance: 3, strength: 1 },
  },
}));

it('preserves every pose, weight and full source bound through the shared preview/export projection boundary', () => {
  const drawLayers = vi.fn();
  renderPerspectiveSamples({ target, width: 400, height: 240, sourceBounds, samples, drawLayers });
  const options = gpu.renderSamples.mock.calls[0]![0];
  expect(options).toMatchObject({
    target,
    bounds: { x: 0, y: 0, width: 400, height: 240 },
    sourceBounds,
    pixelScale: 1,
  });
  expect(options.samples).toEqual(
    samples.map((sample) => ({
      camera: sample.camera,
      weight: sample.weight,
      transform: { tiltX: 0.1, tiltY: -0.2, orbit: sample.camera.orbit },
    })),
  );
  options.draw(target);
  expect(drawLayers).toHaveBeenCalledExactlyOnceWith(target);
});
it('shares a retained compositor across sharp and blurred frames and disposes it explicitly', () => {
  const drawLayers = vi.fn(),
    transform = { tiltX: 0.1, tiltY: 0 },
    camera = { scale: 1.25, focusX: 0.5, focusY: 0.5 };
  renderPerspectiveLayers({ target, width: 400, height: 240, transform, camera, sourceBounds, drawLayers });
  expect(gpu.render.mock.calls[0]![0].draw(target)).toBe(transform);
  renderPerspectiveSamples({ target, width: 400, height: 240, sourceBounds, samples, drawLayers });
  expect(gpu.constructed).toHaveBeenCalledOnce();
  disposePerspectiveRenderer();
  disposePerspectiveRenderer();
  expect(gpu.dispose).toHaveBeenCalledOnce();
  renderPerspectiveSamples({ target, width: 400, height: 240, sourceBounds, samples, drawLayers });
  expect(gpu.constructed).toHaveBeenCalledTimes(2);
});
it('uses flat perspective axes for a pose without legacy tilt and exposes GPU errors to the export owner', () => {
  gpu.renderSamples.mockImplementationOnce(() => {
    throw new Error('GPU unavailable');
  });
  expect(() =>
    renderPerspectiveSamples({
      target,
      width: 400,
      height: 240,
      sourceBounds,
      samples: [{ camera: { scale: 1, focusX: 0.5, focusY: 0.5 }, weight: 1 }],
      drawLayers: vi.fn(),
    }),
  ).toThrow('GPU unavailable');
  expect(gpu.renderSamples.mock.calls[0]![0].samples[0].transform).toEqual({ tiltX: 0, tiltY: 0, orbit: undefined });
});
