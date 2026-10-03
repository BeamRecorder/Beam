import { afterEach, describe, expect, it, vi } from 'vitest';
import { drawWithLayerPerspective, releaseLayerPerspective } from './render-layer-perspective';
import type { Canvas2DContext } from '../canvas-types';
const gpu = vi.hoisted(() => ({ allocate: vi.fn(), render: vi.fn(), dispose: vi.fn() }));
vi.mock('../zoom/webgl-perspective-projector', () => ({
  WebGlPerspectiveProjector: class {
    constructor() {
      gpu.allocate();
    }
    renderGeometry(...args: unknown[]) {
      return gpu.render(...args);
    }
    dispose() {
      gpu.dispose();
    }
  },
}));
const surfaces: Array<{ width: number; height: number; getContext: ReturnType<typeof vi.fn> }> = [];
const context = () => ({
  canvas: { width: 800, height: 600 },
  clearRect: vi.fn(),
  save: vi.fn(),
  restore: vi.fn(),
  setTransform: vi.fn(),
  drawImage: vi.fn(),
  getTransform: () => ({ a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 }),
});
function setup() {
  const ctx = context();
  vi.stubGlobal(
    'OffscreenCanvas',
    class {
      width: number;
      height: number;
      getContext = vi.fn(() => context());
      constructor(w: number, h: number) {
        this.width = w;
        this.height = h;
        surfaces.push(this);
      }
    },
  );
  return ctx;
}
afterEach(() => {
  vi.unstubAllGlobals();
  vi.clearAllMocks();
  surfaces.length = 0;
});
const rect = { x: 100, y: 100, width: 400, height: 200 },
  rotation = { x: 25, y: 0, perspective: 1200 };
describe('retained per-layer GPU perspective', () => {
  it.each([undefined, { x: 0, y: 0, perspective: 1200 }])(
    'keeps flat layers on their direct canvas without GPU allocation',
    (r) => {
      const ctx = setup(),
        draw = vi.fn();
      drawWithLayerPerspective(ctx as unknown as Canvas2DContext, r, rect, 1, draw);
      expect(draw).toHaveBeenCalledWith(ctx);
      expect(gpu.allocate).not.toHaveBeenCalled();
      releaseLayerPerspective(ctx as unknown as Canvas2DContext);
      expect(gpu.dispose).not.toHaveBeenCalled();
    },
  );
  it('reuses resources, restores canvas state and reallocates only after disposal', () => {
    const ctx = setup(),
      target = ctx as unknown as Canvas2DContext,
      draw = vi.fn();
    drawWithLayerPerspective(target, rotation, rect, 1, draw);
    drawWithLayerPerspective(target, { ...rotation, y: 12 }, rect, 1, draw);
    expect(gpu.allocate).toHaveBeenCalledOnce();
    expect(surfaces).toHaveLength(1);
    expect(draw.mock.calls[0]![0]).not.toBe(ctx);
    expect(ctx.save).toHaveBeenCalledTimes(2);
    expect(ctx.restore).toHaveBeenCalledTimes(2);
    expect(gpu.render.mock.calls[0]![3]).toBeInstanceOf(Float32Array);
    releaseLayerPerspective(target);
    expect(surfaces[0]!.width).toBe(0);
    expect(gpu.dispose).toHaveBeenCalledOnce();
    drawWithLayerPerspective(target, rotation, rect, 1, draw);
    expect(gpu.allocate).toHaveBeenCalledTimes(2);
    releaseLayerPerspective(target);
  });
  it('resizes the retained surface to the new output and maps thumbnail translation and scaling', () => {
    const ctx = setup(),
      target = ctx as unknown as Canvas2DContext;
    ctx.getTransform = () => ({ a: 0.5, b: 0, c: 0, d: 0.5, e: 40, f: 20 });
    drawWithLayerPerspective(target, rotation, rect, 1, vi.fn());
    ctx.canvas.width = 400;
    ctx.canvas.height = 300;
    drawWithLayerPerspective(target, rotation, rect, 1, vi.fn());
    expect(surfaces[0]).toMatchObject({ width: 400, height: 300 });
    expect(gpu.allocate).toHaveBeenCalledOnce();
    releaseLayerPerspective(target);
  });
  it('reports an unavailable drawing surface and an allocation failure explicitly', () => {
    const ctx = setup(),
      target = ctx as unknown as Canvas2DContext;
    vi.stubGlobal(
      'OffscreenCanvas',
      class {
        getContext() {
          return null;
        }
      },
    );
    expect(() => drawWithLayerPerspective(target, rotation, rect, 1, vi.fn())).toThrow('canvas unavailable');
    setup();
    gpu.allocate.mockImplementationOnce(() => {
      throw new Error('WebGL unavailable');
    });
    expect(() => drawWithLayerPerspective(target, rotation, rect, 1, vi.fn())).toThrow('WebGL unavailable');
    releaseLayerPerspective(target);
  });
  it('restores the isolated canvas when drawing throws and the output when composition throws', () => {
    const ctx = setup(),
      target = ctx as unknown as Canvas2DContext;
    const error = () => {
      throw new Error('paint failed');
    };
    expect(() => drawWithLayerPerspective(target, rotation, rect, 1, error)).toThrow('paint failed');
    expect(surfaces[0]!.getContext.mock.results[0]!.value.restore).toHaveBeenCalledOnce();
    ctx.drawImage.mockImplementationOnce(error);
    expect(() => drawWithLayerPerspective(target, rotation, rect, 1, vi.fn())).toThrow('paint failed');
    expect(ctx.restore).toHaveBeenCalledOnce();
    releaseLayerPerspective(target);
  });
});
