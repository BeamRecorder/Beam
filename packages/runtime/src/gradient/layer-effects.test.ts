import { afterEach, beforeEach, describe, it, expect, vi } from 'vitest';
import { createGradientEffect, createColorEffect } from '@beam/engine';
import type { Canvas2DContext } from '../canvas-types';
const gpu = vi.hoisted(() => ({ render: vi.fn(), dispose: vi.fn(), created: vi.fn() }));
vi.mock('./gradient-renderer', () => ({
  GradientRenderer: class {
    constructor() {
      gpu.created();
    }
    render = gpu.render;
    dispose = gpu.dispose;
  },
}));
import { drawWithLayerEffects, releaseLayerEffects } from './layer-effects';
function context(canvas = { width: 100, height: 50 }) {
  let alpha = 1,
    operation = 'source-over';
  let filter = 'none';
  const stack: [number, string, string][] = [];
  const calls: { alpha: number; operation: string }[] = [];
  return {
    canvas,
    get globalAlpha() {
      return alpha;
    },
    set globalAlpha(v: number) {
      alpha = v;
    },
    get globalCompositeOperation() {
      return operation;
    },
    set globalCompositeOperation(v: string) {
      operation = v;
    },
    get filter() {
      return filter;
    },
    set filter(v: string) {
      filter = v;
    },
    save: vi.fn(() => {
      stack.push([alpha, operation, filter]);
    }),
    restore: vi.fn(() => {
      [alpha, operation, filter] = stack.pop()!;
    }),
    clearRect: vi.fn(),
    drawImage: vi.fn(() => calls.push({ alpha, operation })),
    getTransform: () => ({ a: 1, b: 0, c: 0, d: 1, e: 10, f: 20 }),
    setTransform: vi.fn(),
    calls,
  };
}
let outputs: ReturnType<typeof context>[];
beforeEach(() => {
  vi.clearAllMocks();
  outputs = [];
  gpu.render.mockReturnValue({});
  vi.stubGlobal(
    'OffscreenCanvas',
    class {
      width: number;
      height: number;
      ctx: ReturnType<typeof context>;
      constructor(w: number, h: number) {
        this.width = w;
        this.height = h;
        this.ctx = context(this);
        outputs.push(this.ctx);
      }
      getContext() {
        return this.ctx;
      }
    },
  );
});
afterEach(() => vi.unstubAllGlobals());
const rect = { x: 0, y: 0, width: 100, height: 50 };
describe('isolated layer gradient effects', () => {
  it('applies color adjustments once to the base alpha without allocating a GPU gradient', () => {
    const ctx = context();
    drawWithLayerEffects(ctx as unknown as Canvas2DContext, [createColorEffect('color', true)], rect, 1, vi.fn());
    expect(outputs[2]!.drawImage).toHaveBeenCalledTimes(1);
    expect(outputs[2]!.calls[0]!.operation).toBe('source-over');
    expect(outputs[2]!.filter).toBe('none');
    expect(gpu.created).not.toHaveBeenCalled();
    releaseLayerEffects(ctx as unknown as Canvas2DContext);
    expect(gpu.dispose).not.toHaveBeenCalled();
    expect(outputs[0]!.canvas.width).toBe(0);
  });
  it('reuses a lazy gradient renderer for a mixed ordered effect stack', () => {
    const ctx = context();
    drawWithLayerEffects(
      ctx as unknown as Canvas2DContext,
      [createColorEffect('color'), createGradientEffect('fill'), createColorEffect('mono', true)],
      rect,
      1,
      vi.fn(),
    );
    expect(gpu.created).toHaveBeenCalledOnce();
    expect(gpu.render).toHaveBeenCalledOnce();
    expect(outputs[2]!.drawImage).toHaveBeenCalledTimes(5);
    releaseLayerEffects(ctx as unknown as Canvas2DContext);
    expect(gpu.dispose).toHaveBeenCalledOnce();
  });
  it('restores filter state if drawing adjusted content fails', () => {
    const ctx = context();
    drawWithLayerEffects(ctx as unknown as Canvas2DContext, [createColorEffect('color')], rect, 1, vi.fn());
    outputs[2]!.drawImage.mockImplementationOnce(() => {
      throw new Error('filter failed');
    });
    expect(() =>
      drawWithLayerEffects(ctx as unknown as Canvas2DContext, [createColorEffect('color')], rect, 1, vi.fn()),
    ).toThrow('filter failed');
    expect(outputs[2]!.filter).toBe('none');
    releaseLayerEffects(ctx as unknown as Canvas2DContext);
  });
  it('renders without allocation when no effect can change the layer', () => {
    const ctx = context(),
      draw = vi.fn();
    drawWithLayerEffects(ctx as unknown as Canvas2DContext, [], rect, 1, draw);
    drawWithLayerEffects(
      ctx as unknown as Canvas2DContext,
      [{ ...createGradientEffect('x'), enabled: false }],
      rect,
      1,
      draw,
    );
    drawWithLayerEffects(
      ctx as unknown as Canvas2DContext,
      [{ ...createGradientEffect('x'), opacity: 0 }],
      rect,
      1,
      draw,
    );
    expect(draw).toHaveBeenCalledTimes(3);
    expect(gpu.created).not.toHaveBeenCalled();
  });
  it('masks the fill and crossfades without changing the target alpha or transform', () => {
    const ctx = context(),
      draw = vi.fn(),
      effect = { ...createGradientEffect('x'), opacity: 35 };
    drawWithLayerEffects(ctx as unknown as Canvas2DContext, [effect], rect, 1, draw);
    expect(draw).toHaveBeenCalledWith(outputs[0]);
    expect(outputs[2]!.calls.at(-1)?.operation).toBe('destination-in');
    expect(outputs[0]!.calls.slice(-2)).toEqual([
      { alpha: 0.65, operation: 'source-over' },
      { alpha: 0.35, operation: 'lighter' },
    ]);
    expect(ctx.globalAlpha).toBe(1);
    expect(ctx.globalCompositeOperation).toBe('source-over');
    expect(ctx.setTransform).toHaveBeenCalledWith(1, 0, 0, 1, 0, 0);
    releaseLayerEffects(ctx as unknown as Canvas2DContext);
    expect(gpu.dispose).toHaveBeenCalledTimes(1);
  });
  it('reuses GPU resources across layers, resizes bounded surfaces, and disposes once', () => {
    const ctx = context(),
      draw = vi.fn();
    for (let i = 0; i < 3; i++)
      drawWithLayerEffects(ctx as unknown as Canvas2DContext, [createGradientEffect(String(i))], rect, 1, draw);
    expect(gpu.created).toHaveBeenCalledTimes(1);
    expect(outputs).toHaveLength(3);
    ctx.canvas.width = 200;
    ctx.canvas.height = 100;
    drawWithLayerEffects(ctx as unknown as Canvas2DContext, [createGradientEffect('next')], rect, 1, draw);
    expect(outputs[0]!.canvas.width).toBe(200);
    expect(outputs[0]!.canvas.height).toBe(100);
    releaseLayerEffects(ctx as unknown as Canvas2DContext);
    releaseLayerEffects(ctx as unknown as Canvas2DContext);
    expect(gpu.dispose).toHaveBeenCalledTimes(1);
    expect(outputs[0]!.canvas.width).toBe(0);
  });
  it.each([0, 1, 2])('reports an unavailable isolation context %s before allocating GPU resources', (missing) => {
    let index = 0;
    vi.stubGlobal(
      'OffscreenCanvas',
      class {
        readonly index = index++;
        width: number;
        height: number;
        constructor(width: number, height: number) {
          this.width = width;
          this.height = height;
        }
        getContext() {
          return this.index === missing ? null : context(this);
        }
      },
    );
    const ctx = context();
    expect(() =>
      drawWithLayerEffects(ctx as unknown as Canvas2DContext, [createGradientEffect('x')], rect, 1, vi.fn()),
    ).toThrow('unavailable');
    expect(gpu.created).not.toHaveBeenCalled();
    releaseLayerEffects(ctx as unknown as Canvas2DContext);
  });
  it('restores isolated canvas state and propagates rendering failures', () => {
    const ctx = context();
    expect(() =>
      drawWithLayerEffects(ctx as unknown as Canvas2DContext, [createGradientEffect('x')], rect, 1, () => {
        throw new Error('paint failed');
      }),
    ).toThrow('paint failed');
    expect(outputs[0]!.restore).toHaveBeenCalled();
    releaseLayerEffects(ctx as unknown as Canvas2DContext);
  });
});
