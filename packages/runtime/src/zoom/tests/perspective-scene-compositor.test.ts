import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PerspectiveSceneCompositor } from '@beam/runtime/zoom/perspective-scene-compositor';

const projector = vi.hoisted(() => ({
  failInitialization: false,
  render: vi.fn(),
  renderGeometry: vi.fn(),
  renderSamples: vi.fn(),
  dispose: vi.fn(),
}));

vi.mock('@beam/runtime/zoom/webgl-perspective-projector', () => ({
  WebGlPerspectiveProjector: class {
    constructor() {
      if (projector.failInitialization) throw new Error('WebGL unavailable');
    }

    render = projector.render;
    renderGeometry = projector.renderGeometry;
    renderSamples = projector.renderSamples;
    maxTextureSize = 8192;
    dispose = projector.dispose;
  },
}));

const context = {
  setTransform: vi.fn(),
  clearRect: vi.fn(),
  imageSmoothingEnabled: false,
  imageSmoothingQuality: 'low',
};

class TestOffscreenCanvas {
  width: number;
  height: number;

  constructor(width: number, height: number) {
    this.width = width;
    this.height = height;
  }

  getContext() {
    return context;
  }
}

describe('PerspectiveSceneCompositor', () => {
  beforeEach(() => {
    projector.failInitialization = false;
    projector.render.mockReset();
    projector.renderGeometry.mockReset();
    projector.renderSamples.mockReset();
    projector.dispose.mockReset();
    vi.stubGlobal('OffscreenCanvas', TestOffscreenCanvas);
  });

  afterEach(() => vi.unstubAllGlobals());

  it('draws the current decoded scene once at the largest shutter scale and transfers one completed exposure', () => {
    const compositor = new PerspectiveSceneCompositor(),
      draw = vi.fn(),
      projected = {};
    projector.renderSamples.mockReturnValue(projected);
    const target = { drawImage: vi.fn() } as unknown as CanvasRenderingContext2D;
    compositor.renderSamples({
      target,
      bounds: { x: 0, y: 0, width: 400, height: 240 },
      sourceBounds: { x: -40, y: -40, width: 480, height: 320 },
      pixelScale: 1,
      samples: [1.25, 1.5, 2].map((scale) => ({
        camera: { scale, focusX: 0.5, focusY: 0.5 },
        transform: { tiltX: 0.1, tiltY: 0 },
        weight: 1 / 3,
      })),
      draw,
    });
    expect(draw).toHaveBeenCalledOnce();
    expect(projector.renderSamples).toHaveBeenCalledWith(
      expect.objectContaining({ width: 960, height: 640 }),
      400,
      240,
      expect.arrayContaining([expect.objectContaining({ weight: 1 / 3 })]),
      { width: 960, height: 640 },
    );
    expect(target.drawImage).toHaveBeenCalledOnce();
    expect(target.drawImage).toHaveBeenCalledWith(projected, 0, 0, 400, 240);
    compositor.dispose();
  });
  it('rejects an empty shutter before invoking the scene painter', () => {
    const compositor = new PerspectiveSceneCompositor(),
      draw = vi.fn();
    expect(() =>
      compositor.renderSamples({
        target: { drawImage: vi.fn() } as unknown as CanvasRenderingContext2D,
        bounds: { x: 0, y: 0, width: 400, height: 240 },
        sourceBounds: { x: 0, y: 0, width: 400, height: 240 },
        pixelScale: 1,
        samples: [],
        draw,
      }),
    ).toThrow(RangeError);
    expect(draw).not.toHaveBeenCalled();
    compositor.dispose();
  });
  it('propagates a shutter GPU failure, disposes its projector and starts a fresh exposure on retry', () => {
    const compositor = new PerspectiveSceneCompositor(),
      draw = vi.fn();
    const options = {
      target: { drawImage: vi.fn() } as unknown as CanvasRenderingContext2D,
      bounds: { x: 0, y: 0, width: 400, height: 240 },
      sourceBounds: { x: 0, y: 0, width: 400, height: 240 },
      pixelScale: 1,
      samples: [{ camera: { scale: 1, focusX: 0.5, focusY: 0.5 }, transform: { tiltX: 0.1, tiltY: 0 }, weight: 1 }],
      draw,
    };
    projector.renderSamples.mockImplementationOnce(() => {
      throw new Error('Exposure GPU lost');
    });
    expect(() => compositor.renderSamples(options)).toThrow('Exposure GPU lost');
    expect(projector.dispose).toHaveBeenCalledOnce();
    expect(options.target.drawImage).not.toHaveBeenCalled();
    compositor.renderSamples(options);
    expect(options.target.drawImage).toHaveBeenCalledOnce();
    compositor.dispose();
  });

  it('draws the projected WebGL surface when projection succeeds', () => {
    const projected = {} as TexImageSource;
    projector.render.mockReturnValue(projected);
    const target = { drawImage: vi.fn() } as unknown as CanvasRenderingContext2D;

    new PerspectiveSceneCompositor().render({
      target,
      bounds: { x: 10, y: 20, width: 100, height: 50 },
      pixelScale: 1,
      draw: () => ({ tiltX: 0.2, tiltY: -0.1 }),
    });

    expect(target.drawImage).toHaveBeenCalledWith(projected, 10, 20, 100, 50);
  });

  it.each(['initialization', 'render'] as const)(
    'falls back to the staged 2D surface after a WebGL %s failure',
    (failure) => {
      projector.failInitialization = failure === 'initialization';
      projector.render.mockImplementation(() => {
        if (failure === 'render') throw new Error('WebGL render failed');
        return {} as TexImageSource;
      });
      const target = { drawImage: vi.fn() } as unknown as CanvasRenderingContext2D;
      const compositor = new PerspectiveSceneCompositor();

      compositor.render({
        target,
        bounds: { x: 10, y: 20, width: 100, height: 50 },
        pixelScale: 1,
        draw: () => ({ tiltX: 0.2, tiltY: -0.1 }),
      });

      expect(target.drawImage).toHaveBeenCalledWith(expect.any(TestOffscreenCanvas), 10, 20, 100, 50);
      if (failure === 'render') expect(projector.dispose).toHaveBeenCalledOnce();
    },
  );

  it('captures the whole plane at zoom density while keeping output dimensions independent', () => {
    projector.renderGeometry.mockReturnValue({});
    const target = { drawImage: vi.fn() } as unknown as CanvasRenderingContext2D;
    new PerspectiveSceneCompositor().render({
      target,
      bounds: { x: 0, y: 0, width: 400, height: 240 },
      pixelScale: 1,
      camera: { scale: 2, focusX: 0.5, focusY: 0.5 },
      sourceBounds: { x: -100, y: -80, width: 600, height: 400 },
      draw: () => ({ tiltX: 0.1, tiltY: 0 }),
    });
    expect(context.setTransform).toHaveBeenLastCalledWith(2, 0, 0, 2, 200, 160);
    expect(projector.renderGeometry).toHaveBeenCalledWith(
      expect.objectContaining({ width: 1200, height: 800 }),
      400,
      240,
      expect.any(Float32Array),
      { width: 1200, height: 800 },
    );
    expect(target.drawImage).toHaveBeenCalledWith({}, 0, 0, 400, 240);
  });

  it('retains unprojected camera focus when the camera becomes front-facing', () => {
    const target = { drawImage: vi.fn() } as unknown as CanvasRenderingContext2D;
    new PerspectiveSceneCompositor().render({
      target,
      bounds: { x: 10, y: 20, width: 400, height: 240 },
      pixelScale: 1,
      camera: { scale: 2, focusX: 0.25, focusY: 0.75 },
      sourceBounds: { x: -90, y: -60, width: 600, height: 400 },
      draw: () => ({ tiltX: 0, tiltY: 0 }),
    });
    expect(target.drawImage).toHaveBeenCalledWith(expect.any(TestOffscreenCanvas), -190, -380, 1200, 800);
    expect(projector.renderGeometry).not.toHaveBeenCalled();
  });

  it('uses viewport bounds when a full plane needs no padding and reuses its source surface', () => {
    projector.renderGeometry.mockReturnValue({});
    const compositor = new PerspectiveSceneCompositor(),
      target = { drawImage: vi.fn() } as unknown as CanvasRenderingContext2D;
    for (const scale of [1, 2, 1])
      compositor.render({
        target,
        bounds: { x: 0, y: 0, width: 100, height: 50 },
        pixelScale: 1,
        camera: { scale, focusX: 0.5, focusY: 0.5 },
        draw: () => ({ tiltX: 0.1, tiltY: 0 }),
      });
    const sources = projector.renderGeometry.mock.calls.map((c) => c[0]);
    expect(sources[0]).toBe(sources[1]);
    expect(sources[1]).toBe(sources[2]);
    expect(projector.renderGeometry.mock.calls.map((c) => c[4])).toEqual([
      { width: 100, height: 50 },
      { width: 200, height: 100 },
      { width: 100, height: 50 },
    ]);
  });

  it('releases its full source raster on disposal and can start again without stale texture dimensions', () => {
    const compositor = new PerspectiveSceneCompositor(),
      target = { drawImage: vi.fn() } as unknown as CanvasRenderingContext2D;
    compositor.dispose();
    compositor.dispose();
    const render = () =>
      compositor.render({
        target,
        bounds: { x: 0, y: 0, width: 400, height: 240 },
        pixelScale: 1,
        camera: { scale: 2, focusX: 0.5, focusY: 0.5 },
        draw: () => ({ tiltX: 0.1, tiltY: 0 }),
      });
    render();
    const first = projector.renderGeometry.mock.calls[0]![0] as TestOffscreenCanvas;
    expect(first).toMatchObject({ width: 800, height: 480 });
    compositor.dispose();
    expect(first).toMatchObject({ width: 0, height: 0 });
    render();
    const second = projector.renderGeometry.mock.calls[1]![0];
    expect(second).not.toBe(first);
    expect(second).toMatchObject({ width: 800, height: 480 });
    compositor.dispose();
  });
});
