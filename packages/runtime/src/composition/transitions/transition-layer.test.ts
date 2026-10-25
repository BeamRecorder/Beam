import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Canvas2DContext } from '../../canvas-types';
import type { TransitionEffectState } from '@beam/engine/shared/transition-types';
import { drawTransitionLayer, releaseTransitionLayer } from './transition-layer';

const effects = vi.hoisted(() => ({ draw: vi.fn() }));
vi.mock('./transition-effects', () => ({ drawTransitionEffect: effects.draw }));

class Context {
  globalAlpha = 1;
  globalCompositeOperation = 'source-over';
  matrix = { a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 };
  private stack: Array<{ alpha: number; operation: string; matrix: Context['matrix'] }> = [];
  readonly drawImage = vi.fn();
  readonly clearRect = vi.fn();
  readonly beginPath = vi.fn();
  readonly rect = vi.fn();
  readonly clip = vi.fn();
  readonly getTransform = vi.fn(() => ({ ...this.matrix }));
  readonly setTransform = vi.fn((...values: unknown[]) => {
    if (values.length === 1) this.matrix = { ...(values[0] as typeof this.matrix) };
    else {
      const [a, b, c, d, e, f] = values.map(Number);
      this.matrix = { a: a!, b: b!, c: c!, d: d!, e: e!, f: f! };
    }
  });
  readonly save = vi.fn(() =>
    this.stack.push({ alpha: this.globalAlpha, operation: this.globalCompositeOperation, matrix: { ...this.matrix } }),
  );
  readonly restore = vi.fn(() => {
    const state = this.stack.pop();
    if (state) {
      this.globalAlpha = state.alpha;
      this.globalCompositeOperation = state.operation;
      this.matrix = state.matrix;
    }
  });
  readonly canvas: { width: number; height: number };
  constructor(canvas: { width: number; height: number }) {
    this.canvas = canvas;
  }
}
class Canvas {
  readonly context: Context | null;
  width: number;
  height: number;
  constructor(width: number, height: number) {
    this.width = width;
    this.height = height;
    this.context = hasContext ? new Context(this) : null;
    surfaces.push(this);
  }
  getContext() {
    return this.context as unknown as OffscreenCanvasRenderingContext2D | null;
  }
}
let hasContext = true;
let surfaces: Canvas[] = [];
const effect: TransitionEffectState = { preset: { kind: 'linear-wipe' }, progress: 0.4, edge: 'entry' };
const frame = { x: 20, y: 10, width: 40, height: 30 };
const typed = (ctx: Context) => ctx as unknown as Canvas2DContext;
beforeEach(() => {
  hasContext = true;
  surfaces = [];
  effects.draw.mockReset();
  vi.stubGlobal('OffscreenCanvas', Canvas);
});
afterEach(() => vi.unstubAllGlobals());

describe('isolated transition layers', () => {
  it('rejects an oversized isolation surface before retaining or drawing any artwork', () => {
    const draw = vi.fn();
    expect(() => drawTransitionLayer(typed(new Context({ width: 4097, height: 4096 })), frame, effect, draw)).toThrow(
      'memory budget',
    );
    expect(surfaces).toHaveLength(0);
    expect(draw).not.toHaveBeenCalled();
    expect(effects.draw).not.toHaveBeenCalled();
  });
  it.each(['horizontal', 'vertical'])('does not submit a GPU region collapsed along the %s axis', (axis) => {
    const ctx = new Context({ width: 640, height: 480 });
    ctx.matrix = { a: axis === 'horizontal' ? 0 : 2, b: 0, c: 0, d: axis === 'vertical' ? 0 : 2, e: 20, f: 10 };
    drawTransitionLayer(typed(ctx), frame, effect, vi.fn());
    expect(effects.draw).not.toHaveBeenCalled();
    expect(ctx.save).not.toHaveBeenCalled();
  });
  it('draws only the current artwork into a clean surface and applies inherited opacity once at composition', () => {
    const ctx = new Context({ width: 640, height: 480 });
    ctx.globalAlpha = 0.35;
    ctx.globalCompositeOperation = 'screen';
    ctx.matrix = { a: 2, b: 0, c: 0, d: 2, e: 10, f: 15 };
    const matrix = { ...ctx.matrix };
    const draw = vi.fn((target: Canvas2DContext) => {
      expect(target).not.toBe(ctx);
      expect(target.globalAlpha).toBe(1);
      expect(target.globalCompositeOperation).toBe('source-over');
      expect(target.getTransform()).toEqual(matrix);
      target.drawImage({} as CanvasImageSource, 5, 10);
    });
    effects.draw.mockImplementation((destination: Canvas2DContext) => {
      expect(destination.getTransform()).toEqual({ a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 });
      expect(destination.globalAlpha).toBe(0.35);
      expect(destination.globalCompositeOperation).toBe('screen');
    });
    drawTransitionLayer(typed(ctx), frame, effect, draw);
    expect(surfaces).toHaveLength(1);
    const target = surfaces[0]!.context!;
    expect(target.clearRect).toHaveBeenCalledWith(0, 0, 640, 480);
    expect(target.drawImage).toHaveBeenCalledOnce();
    expect(target.drawImage).not.toHaveBeenCalledWith(ctx.canvas, expect.anything(), expect.anything());
    expect(ctx.drawImage).not.toHaveBeenCalled();
    expect(ctx.matrix).toEqual(matrix);
    expect(ctx.globalAlpha).toBe(0.35);
    expect(draw).toHaveBeenCalledOnce();
  });
  it('maps all transformed corners into a normalized effect region, including rotated camera transforms', () => {
    const ctx = new Context({ width: 640, height: 480 });
    ctx.matrix = { a: 0, b: 2, c: -2, d: 0, e: 220, f: 10 };
    drawTransitionLayer(typed(ctx), frame, effect, vi.fn());
    expect(effects.draw).toHaveBeenCalledWith(ctx, surfaces[0], { x: 0, y: 0, width: 640, height: 480 }, effect, {
      x: 140 / 640,
      y: 50 / 480,
      width: 60 / 640,
      height: 80 / 480,
    });
  });
  it('reuses and clears the same owner’s surface, resizes it, and isolates another destination', () => {
    const ctx = new Context({ width: 640, height: 480 });
    drawTransitionLayer(typed(ctx), frame, effect, vi.fn());
    drawTransitionLayer(typed(ctx), frame, effect, vi.fn());
    expect(surfaces).toHaveLength(1);
    ctx.canvas.width = 800;
    ctx.canvas.height = 300;
    drawTransitionLayer(typed(ctx), frame, effect, vi.fn());
    expect(surfaces).toHaveLength(1);
    expect(surfaces[0]).toMatchObject({ width: 800, height: 300 });
    expect(surfaces[0]!.context!.clearRect).toHaveBeenLastCalledWith(0, 0, 800, 300);
    drawTransitionLayer(typed(new Context({ width: 40, height: 30 })), frame, effect, vi.fn());
    expect(surfaces).toHaveLength(2);
  });
  it('restores the isolated drawing context when the clip painter fails and never composites partial artwork', () => {
    const ctx = new Context({ width: 640, height: 480 });
    expect(() =>
      drawTransitionLayer(typed(ctx), frame, effect, (target) => {
        target.globalAlpha = 0.1;
        target.setTransform(2, 0, 0, 2, 5, 8);
        throw new Error('artwork failure');
      }),
    ).toThrow('artwork failure');
    expect(surfaces[0]!.context!.restore).toHaveBeenCalledOnce();
    expect(effects.draw).not.toHaveBeenCalled();
    drawTransitionLayer(typed(ctx), frame, effect, (target) => expect(target.globalAlpha).toBe(1));
  });
  it('restores destination transforms, opacity and blending after a GPU composition failure', () => {
    const ctx = new Context({ width: 640, height: 480 });
    ctx.matrix = { a: -2, b: 0, c: 0, d: 2, e: 100, f: 50 };
    const matrix = { ...ctx.matrix };
    ctx.globalAlpha = 0.4;
    effects.draw.mockImplementation(() => {
      throw new Error('GPU failure');
    });
    expect(() => drawTransitionLayer(typed(ctx), frame, effect, vi.fn())).toThrow('GPU failure');
    expect(ctx.restore).toHaveBeenCalledOnce();
    expect(ctx.matrix).toEqual(matrix);
    expect(ctx.globalAlpha).toBe(0.4);
  });
  it('reports unavailable isolation contexts without calling the painter or GPU', () => {
    hasContext = false;
    const draw = vi.fn();
    expect(() => drawTransitionLayer(typed(new Context({ width: 640, height: 480 })), frame, effect, draw)).toThrow(
      'context is unavailable',
    );
    expect(draw).not.toHaveBeenCalled();
    expect(effects.draw).not.toHaveBeenCalled();
  });
  it('copies a backdrop only for a blur layer and clips its compositing to the requested artwork region', () => {
    const ctx = new Context({ width: 640, height: 480 });
    drawTransitionLayer(typed(ctx), frame, effect, vi.fn(), true);
    expect(surfaces[0]!.context!.drawImage).toHaveBeenCalledWith(ctx.canvas, 0, 0);
    expect(ctx.beginPath).toHaveBeenCalledOnce();
    expect(ctx.rect).toHaveBeenCalledWith(20, 10, 40, 30);
    expect(ctx.clip).toHaveBeenCalledOnce();
    expect(ctx.clip.mock.invocationCallOrder[0]).toBeLessThan(effects.draw.mock.invocationCallOrder[0]!);
    expect(ctx.restore).toHaveBeenCalledOnce();
  });
  it('releases only the owner’s surface, is idempotent and allocates a fresh canvas after release', () => {
    const ctx = new Context({ width: 640, height: 480 });
    const other = new Context({ width: 640, height: 480 });
    drawTransitionLayer(typed(ctx), frame, effect, vi.fn());
    drawTransitionLayer(typed(other), frame, effect, vi.fn());
    releaseTransitionLayer(typed(ctx));
    releaseTransitionLayer(typed(ctx));
    expect(surfaces[0]).toMatchObject({ width: 1, height: 1 });
    expect(surfaces[1]).toMatchObject({ width: 640, height: 480 });
    drawTransitionLayer(typed(ctx), frame, effect, vi.fn());
    expect(surfaces).toHaveLength(3);
    expect(surfaces[2]).toMatchObject({ width: 640, height: 480 });
    expect(() => releaseTransitionLayer(typed(new Context({ width: 1, height: 1 })))).not.toThrow();
  });
});
