import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const projector = vi.hoisted(() => ({
  failInitialization: false,
  render: vi.fn(),
  dispose: vi.fn(),
}));

vi.mock('../webgl-perspective-projector', () => ({
  WebGlPerspectiveProjector: class {
    constructor() {
      if (projector.failInitialization) throw new Error('WebGL unavailable');
    }

    render = projector.render;
    dispose = projector.dispose;
  },
}));

import { PerspectiveSceneCompositor } from '../perspective-scene-compositor';

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
    projector.dispose.mockReset();
    vi.stubGlobal('OffscreenCanvas', TestOffscreenCanvas);
  });

  afterEach(() => vi.unstubAllGlobals());

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
});
