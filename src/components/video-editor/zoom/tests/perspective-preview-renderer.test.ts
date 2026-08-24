import { beforeEach, describe, expect, it, vi } from 'vitest';

const render = vi.fn();
const dispose = vi.fn();

vi.mock('../perspective-scene-compositor', () => ({
  PerspectiveSceneCompositor: class {
    render = render;
    dispose = dispose;
  },
}));

import { PerspectivePreviewRenderer } from '../perspective-preview-renderer';
import type { ZoomElement } from '../zoom-types';

const perspectiveZoom: ZoomElement = {
  id: 'zoom',
  sessionId: 'session',
  startMs: 3_000,
  endMs: 4_000,
  focus: { cx: 0.5, cy: 0.5 },
  depth: 2,
  mode: 'manual',
  projection: '3d',
  tiltIntensity: 0.6,
};

describe('PerspectivePreviewRenderer', () => {
  beforeEach(() => {
    render.mockReset();
    dispose.mockReset();
  });

  it('draws directly when no perspective zoom is nearby', () => {
    const renderer = new PerspectivePreviewRenderer();
    const target = {} as CanvasRenderingContext2D;
    const scene = { tiltX: 0, tiltY: 0, marker: 'direct' };
    const drawScene = vi.fn(() => scene);

    expect(
      renderer.render({
        target,
        bounds: { x: 0, y: 0, width: 100, height: 50 },
        pixelScale: 1,
        timeMs: 0,
        zooms: [perspectiveZoom],
        drawScene,
      }),
    ).toBe(scene);
    expect(drawScene).toHaveBeenCalledWith(target);
    expect(render).not.toHaveBeenCalled();
  });

  it('stages nearby perspective frames and returns the camera window', () => {
    const renderer = new PerspectivePreviewRenderer();
    const stage = {} as CanvasRenderingContext2D;
    const scene = { tiltX: 0.1, tiltY: -0.05, marker: 'staged' };
    render.mockImplementation((options) => {
      expect(options.draw(stage)).toEqual({ tiltX: 0.1, tiltY: -0.05 });
    });

    expect(
      renderer.render({
        target: {} as CanvasRenderingContext2D,
        bounds: { x: 10, y: 20, width: 100, height: 50 },
        pixelScale: 2,
        timeMs: 2_000,
        zooms: [perspectiveZoom],
        drawScene: () => scene,
      }),
    ).toBe(scene);
    renderer.dispose();
    expect(dispose).toHaveBeenCalledOnce();
  });

  it('normalizes omitted tilt axes from a staged camera window', () => {
    const renderer = new PerspectivePreviewRenderer();
    render.mockImplementation((options) => {
      expect(options.draw({} as CanvasRenderingContext2D)).toEqual({ tiltX: 0, tiltY: 0 });
    });

    renderer.render({
      target: {} as CanvasRenderingContext2D,
      bounds: { x: 0, y: 0, width: 100, height: 50 },
      pixelScale: 1,
      timeMs: 3_500,
      zooms: [perspectiveZoom],
      drawScene: () => ({ marker: 'legacy-window', tiltX: undefined, tiltY: undefined }),
    });
  });

  it('fails explicitly if a compositor does not evaluate the scene', () => {
    const renderer = new PerspectivePreviewRenderer();
    render.mockImplementation(() => undefined);

    expect(() =>
      renderer.render({
        target: {} as CanvasRenderingContext2D,
        bounds: { x: 0, y: 0, width: 100, height: 50 },
        pixelScale: 1,
        timeMs: 3_500,
        zooms: [perspectiveZoom],
        drawScene: () => ({ tiltX: 0, tiltY: 0 }),
      }),
    ).toThrow('Unable to resolve the perspective zoom camera window.');
  });
});
