import { afterEach, describe, expect, it, vi } from 'vitest';
import type { BlurClip } from '~/media/shared/composition-types';
import type { Canvas2DContext } from '~/types/canvas';
import { applyHighlightEffect, releaseHighlightSurface } from './highlight-effect';

type Transform = { a: number; b: number; c: number; d: number; e: number; f: number };

class RecordingContext {
  canvas: { width: number; height: number };
  globalAlpha = 1;
  globalCompositeOperation = 'source-over';
  filter = 'none';
  fillStyle: string | CanvasGradient | CanvasPattern = '#000000';
  transform: Transform = { a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 };
  readonly fillStates: Array<{
    rule?: CanvasFillRule;
    color: string | CanvasGradient | CanvasPattern;
    alpha: number;
    composite: string;
    filter: string;
  }> = [];
  readonly fillRectStates: Array<{
    rect: { x: number; y: number; width: number; height: number };
    color: string | CanvasGradient | CanvasPattern;
    alpha: number;
    composite: string;
    filter: string;
  }> = [];
  readonly drawStates: Array<{ alpha: number; composite: string }> = [];
  private readonly stack: Array<{
    alpha: number;
    composite: string;
    filter: string;
    fillStyle: string | CanvasGradient | CanvasPattern;
    transform: Transform;
  }> = [];

  save = vi.fn(() => {
    this.stack.push({
      alpha: this.globalAlpha,
      composite: this.globalCompositeOperation,
      filter: this.filter,
      fillStyle: this.fillStyle,
      transform: { ...this.transform },
    });
  });
  restore = vi.fn(() => {
    const state = this.stack.pop();
    if (!state) return;
    this.globalAlpha = state.alpha;
    this.globalCompositeOperation = state.composite;
    this.filter = state.filter;
    this.fillStyle = state.fillStyle;
    this.transform = state.transform;
  });
  beginPath = vi.fn();
  rect = vi.fn();
  moveTo = vi.fn();
  arc = vi.fn();
  roundRect = vi.fn();
  fill = vi.fn((rule?: CanvasFillRule) => {
    this.fillStates.push({
      rule,
      color: this.fillStyle,
      alpha: this.globalAlpha,
      composite: this.globalCompositeOperation,
      filter: this.filter,
    });
  });
  fillRect = vi.fn((x: number, y: number, width: number, height: number) => {
    this.fillRectStates.push({
      rect: { x, y, width, height },
      color: this.fillStyle,
      alpha: this.globalAlpha,
      composite: this.globalCompositeOperation,
      filter: this.filter,
    });
  });
  clearRect = vi.fn();
  drawImage = vi.fn(() => {
    this.drawStates.push({ alpha: this.globalAlpha, composite: this.globalCompositeOperation });
  });

  constructor(width: number, height: number) {
    this.canvas = { width, height };
  }

  getTransform = vi.fn(() => ({ ...this.transform }));
  setTransform = vi.fn((first: Transform | number, b = 0, c = 0, d = 1, e = 0, f = 0) => {
    this.transform =
      typeof first === 'number'
        ? { a: first, b, c, d, e, f }
        : {
            a: first.a,
            b: first.b,
            c: first.c,
            d: first.d,
            e: first.e,
            f: first.f,
          };
  });
}

const highlightClip = (overrides: Partial<BlurClip> = {}): BlurClip => ({
  id: 'highlight',
  kind: 'blur',
  assetId: '',
  name: 'Highlight',
  timelineStartMs: 0,
  timelineDurationMs: 5_000,
  sourceInMs: 0,
  sourceDurationMs: 5_000,
  playbackRate: 1,
  transitions: { entry: null, exit: null },
  enabled: true,
  order: 0,
  transform: { x: 0.2, y: 0.2, width: 0.4, height: 0.3 },
  shape: 'rectangle',
  mode: 'highlight',
  strength: 50,
  feather: 0,
  cornerRadius: 0,
  tintOpacity: 0,
  color: '#ffcc00',
  ...overrides,
});

const installRecordingOffscreenCanvas = () => {
  const surfaces: Array<{ canvas: { width: number; height: number }; context: RecordingContext }> = [];
  class FakeOffscreenCanvas {
    width: number;
    height: number;
    readonly context: RecordingContext;

    constructor(width: number, height: number) {
      this.width = width;
      this.height = height;
      this.context = new RecordingContext(width, height);
      surfaces.push({ canvas: this, context: this.context });
    }

    getContext() {
      return this.context;
    }
  }
  vi.stubGlobal('OffscreenCanvas', FakeOffscreenCanvas);
  return surfaces;
};

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('highlight effect renderer', () => {
  it('uses an HTML canvas without OffscreenCanvas and restores state on allocation failure', () => {
    vi.stubGlobal('OffscreenCanvas', undefined);
    const scratch = new RecordingContext(1, 1);
    const context = vi.spyOn(HTMLCanvasElement.prototype, 'getContext');
    context.mockReturnValue(scratch as unknown as CanvasRenderingContext2D);
    const output = new RecordingContext(640, 360);
    const ctx = output as unknown as Canvas2DContext;
    const rect = { x: 10, y: 20, width: 100, height: 50 };
    applyHighlightEffect(ctx, highlightClip({ feather: 20 }), rect);
    expect(output.drawImage).toHaveBeenCalledWith(expect.any(HTMLCanvasElement), 0, 0);
    releaseHighlightSurface(ctx);
    context.mockReturnValue(null);
    output.globalAlpha = 0.7;
    expect(() => applyHighlightEffect(ctx, highlightClip({ feather: 20 }), rect)).toThrow(
      'Highlight canvas context is unavailable',
    );
    expect(output.globalAlpha).toBe(0.7);
    expect(output.transform).toEqual({ a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 });
  });

  it('fills the outside of a rectangle and preserves caller transition state', () => {
    const ctx = new RecordingContext(800, 600);
    ctx.globalAlpha = 0.8;
    ctx.globalCompositeOperation = 'multiply';
    ctx.setTransform(2, 0, 0, 2, 10, 15);
    const originalTransform = { ...ctx.transform };

    applyHighlightEffect(ctx as unknown as Canvas2DContext, highlightClip(), {
      x: 100,
      y: 80,
      width: 300,
      height: 200,
    });

    expect(ctx.fill).toHaveBeenCalledWith('evenodd');
    expect(ctx.rect).toHaveBeenNthCalledWith(1, 0, 0, 800, 600);
    expect(ctx.rect).toHaveBeenNthCalledWith(2, 100, 80, 300, 200);
    expect(ctx.fillStates).toContainEqual({
      rule: 'evenodd',
      color: '#ffcc00',
      alpha: 0.4,
      composite: 'multiply',
      filter: 'none',
    });
    expect(ctx.globalAlpha).toBe(0.8);
    expect(ctx.globalCompositeOperation).toBe('multiply');
    expect(ctx.transform).toEqual(originalTransform);
    expect(ctx.drawImage).not.toHaveBeenCalled();
  });

  it('uses independent caller-scaled colors and opacities for hard-edged outside and inside fills', () => {
    const allocations = vi.fn();
    class FakeOffscreenCanvas {
      constructor() {
        allocations();
      }
    }
    vi.stubGlobal('OffscreenCanvas', FakeOffscreenCanvas);

    const ctx = new RecordingContext(800, 600);
    ctx.globalAlpha = 0.8;
    ctx.globalCompositeOperation = 'multiply';
    const clip = highlightClip({
      strength: 30,
      tintOpacity: 45,
      color: '#ff000066',
      highlightColor: '#0000ff40',
    });

    applyHighlightEffect(ctx as unknown as Canvas2DContext, clip, { x: 10, y: 20, width: 100, height: 80 });

    expect(allocations).not.toHaveBeenCalled();
    expect(ctx.fillStates).toHaveLength(2);
    expect(ctx.fillStates.map(({ rule, color, composite }) => ({ rule, color, composite }))).toEqual([
      { rule: 'evenodd', color: clip.color, composite: 'multiply' },
      { rule: undefined, color: clip.highlightColor, composite: 'multiply' },
    ]);
    expect(ctx.fillStates[0]!.alpha).toBeCloseTo(0.24);
    expect(ctx.fillStates[1]!.alpha).toBeCloseTo(0.36);
  });

  it('uses white as the legacy interior color and keeps tintOpacity zero clips unchanged', () => {
    const interior = new RecordingContext(800, 600);
    applyHighlightEffect(interior as unknown as Canvas2DContext, highlightClip({ tintOpacity: 40 }), {
      x: 10,
      y: 20,
      width: 100,
      height: 80,
    });
    expect(interior.fillStates).toHaveLength(2);
    expect(interior.fillStates[1]).toMatchObject({ color: '#ffffff', alpha: 0.4 });

    const legacy = new RecordingContext(800, 600);
    applyHighlightEffect(
      legacy as unknown as Canvas2DContext,
      highlightClip({ tintOpacity: 0, highlightColor: undefined }),
      { x: 10, y: 20, width: 100, height: 80 },
    );
    expect(legacy.fillStates).toHaveLength(1);
    expect(legacy.fillStates[0]).toMatchObject({ color: '#ffcc00', alpha: 0.5 });
  });

  it('draws an interior-only highlight when outside strength is zero', () => {
    const ctx = new RecordingContext(800, 600);
    ctx.globalAlpha = 0.6;

    applyHighlightEffect(
      ctx as unknown as Canvas2DContext,
      highlightClip({ strength: 0, tintOpacity: 40, highlightColor: '#22aaee' }),
      { x: 10, y: 20, width: 100, height: 80 },
    );

    expect(ctx.fillStates).toHaveLength(1);
    expect(ctx.fillStates[0]).toMatchObject({ color: '#22aaee' });
    expect(ctx.fillStates[0]!.alpha).toBeCloseTo(0.24);
    expect(ctx.fillStates[0]!.rule).toBeUndefined();
  });

  it('uses the selected circle and rounded rectangle as the transparent interior', () => {
    const circle = new RecordingContext(800, 600);
    applyHighlightEffect(circle as unknown as Canvas2DContext, highlightClip({ shape: 'circle', cornerRadius: 0 }), {
      x: 10,
      y: 20,
      width: 100,
      height: 80,
    });
    expect(circle.rect).toHaveBeenCalledTimes(1);
    expect(circle.moveTo).toHaveBeenCalledWith(100, 60);
    expect(circle.arc).toHaveBeenCalledWith(60, 60, 40, 0, Math.PI * 2);
    expect(circle.fill).toHaveBeenCalledWith('evenodd');

    const rounded = new RecordingContext(800, 600);
    applyHighlightEffect(rounded as unknown as Canvas2DContext, highlightClip({ cornerRadius: 50 }), {
      x: 10,
      y: 20,
      width: 100,
      height: 80,
    });
    expect(rounded.roundRect).toHaveBeenCalledWith(10, 20, 100, 80, 20);
    expect(rounded.fill).toHaveBeenCalledWith('evenodd');
  });

  it('keeps square effects centered when a saved clip has no corner radius', () => {
    const ctx = new RecordingContext(800, 600);
    applyHighlightEffect(
      ctx as unknown as Canvas2DContext,
      highlightClip({ shape: 'square', cornerRadius: undefined }),
      {
        x: 10,
        y: 20,
        width: 100,
        height: 80,
      },
    );
    expect(ctx.rect).toHaveBeenNthCalledWith(2, 20, 20, 80, 80);
    expect(ctx.roundRect).not.toHaveBeenCalled();
    expect(ctx.fill).toHaveBeenCalledWith('evenodd');
  });

  it('does no work for empty targets, empty canvases, or zero opacity', () => {
    const surfaces = installRecordingOffscreenCanvas();

    const output = new RecordingContext(800, 600);
    const ctx = output as unknown as Canvas2DContext;
    applyHighlightEffect(ctx, highlightClip({ feather: 20, strength: 0 }), { x: 10, y: 10, width: 80, height: 60 });
    applyHighlightEffect(ctx, highlightClip({ feather: 20 }), { x: 10, y: 10, width: 0, height: 60 });
    applyHighlightEffect(new RecordingContext(0, 600) as unknown as Canvas2DContext, highlightClip({ feather: 20 }), {
      x: 10,
      y: 10,
      width: 80,
      height: 60,
    });

    applyHighlightEffect(ctx, highlightClip(), { x: 10, y: 10, width: 80, height: 0 });
    applyHighlightEffect(new RecordingContext(800, 0) as unknown as Canvas2DContext, highlightClip(), {
      x: 10,
      y: 10,
      width: 80,
      height: 60,
    });
    expect(surfaces).toHaveLength(0);
    expect(output.fillStates).toEqual([]);
    expect(output.fillRectStates).toEqual([]);
    expect(output.drawImage).not.toHaveBeenCalled();
  });

  it('reuses one feather surface and applies opacity without changing the caller blend state', () => {
    const surfaces = installRecordingOffscreenCanvas();

    const output = new RecordingContext(320, 180);
    output.globalAlpha = 0.4;
    output.globalCompositeOperation = 'screen';
    output.filter = 'contrast(1.2)';
    output.setTransform(2, 0, 0, 2, 4, 6);
    const originalTransform = { ...output.transform };
    const ctx = output as unknown as Canvas2DContext;
    const clip = highlightClip({
      strength: 50,
      tintOpacity: 30,
      color: '#ff000066',
      highlightColor: '#0000ff40',
      feather: 25,
    });
    const rect = { x: 20, y: 30, width: 100, height: 50 };

    applyHighlightEffect(ctx, clip, rect);
    applyHighlightEffect(ctx, clip, rect);

    expect(surfaces).toHaveLength(1);
    expect(surfaces[0]!.canvas).toMatchObject({ width: 320, height: 180 });
    expect(surfaces[0]!.context.fillRect).toHaveBeenCalledTimes(2);
    expect(surfaces[0]!.context.fillRectStates).toEqual([
      expect.objectContaining({
        rect: { x: 0, y: 0, width: 320, height: 180 },
        color: clip.color,
        alpha: 0.5,
        composite: 'source-over',
      }),
      expect.objectContaining({
        rect: { x: 0, y: 0, width: 320, height: 180 },
        color: clip.color,
        alpha: 0.5,
        composite: 'source-over',
      }),
    ]);
    expect(surfaces[0]!.context.fillStates).toHaveLength(4);
    expect(surfaces[0]!.context.fillStates[0]).toMatchObject({
      color: '#ffffff',
      alpha: 1,
      composite: 'destination-out',
      filter: 'blur(5px)',
    });
    expect(surfaces[0]!.context.fillStates[1]).toMatchObject({
      color: clip.highlightColor,
      alpha: 0.3,
      composite: 'source-over',
      filter: 'blur(5px)',
    });
    expect(surfaces[0]!.context.fillStates[2]).toMatchObject({
      color: '#ffffff',
      alpha: 1,
      composite: 'destination-out',
      filter: 'blur(5px)',
    });
    expect(surfaces[0]!.context.fillStates[3]).toMatchObject({
      color: clip.highlightColor,
      alpha: 0.3,
      composite: 'source-over',
      filter: 'blur(5px)',
    });
    expect(output.drawImage).toHaveBeenCalledTimes(2);
    expect(output.drawStates).toEqual([
      { alpha: 0.4, composite: 'screen' },
      { alpha: 0.4, composite: 'screen' },
    ]);
    expect(output.globalAlpha).toBe(0.4);
    expect(output.globalCompositeOperation).toBe('screen');
    expect(output.filter).toBe('contrast(1.2)');
    expect(output.transform).toEqual(originalTransform);

    const changedClip = {
      ...clip,
      strength: 25,
      tintOpacity: 55,
      color: '#0c223899',
      highlightColor: '#646e784d',
    };
    applyHighlightEffect(ctx, changedClip, rect);
    expect(surfaces).toHaveLength(1);
    expect(surfaces[0]!.context.fillRectStates[2]).toMatchObject({
      color: changedClip.color,
      alpha: 0.25,
      composite: 'source-over',
    });
    expect(surfaces[0]!.context.fillStates[5]).toMatchObject({
      color: changedClip.highlightColor,
      alpha: 0.55,
      composite: 'source-over',
      filter: 'blur(5px)',
    });
    expect(output.drawStates[2]).toEqual({ alpha: 0.4, composite: 'screen' });

    output.canvas.width = 640;
    output.canvas.height = 360;
    applyHighlightEffect(ctx, clip, rect);
    expect(surfaces).toHaveLength(1);
    expect(surfaces[0]!.canvas).toMatchObject({ width: 640, height: 360 });
    applyHighlightEffect(ctx, { ...clip, feather: 0 }, rect);
    expect(surfaces[0]!.canvas).toMatchObject({ width: 0, height: 0 });
    releaseHighlightSurface(ctx);
    expect(surfaces[0]!.canvas).toMatchObject({ width: 0, height: 0 });
  });

  it('renders only an interior tint with feathering when outside strength is zero', () => {
    const surfaces = installRecordingOffscreenCanvas();

    const output = new RecordingContext(800, 600);
    output.globalAlpha = 0.6;
    const ctx = output as unknown as Canvas2DContext;
    const clip = highlightClip({
      strength: 0,
      tintOpacity: 40,
      highlightColor: '#14283c80',
      feather: 25,
    });

    applyHighlightEffect(ctx, clip, { x: 10, y: 20, width: 100, height: 80 });

    expect(surfaces).toHaveLength(1);
    expect(surfaces[0]!.context.fillRectStates).toEqual([]);
    expect(surfaces[0]!.context.fillStates).toHaveLength(1);
    expect(surfaces[0]!.context.fillStates[0]).toMatchObject({
      color: clip.highlightColor,
      alpha: 0.4,
      composite: 'source-over',
      filter: 'blur(4px)',
    });
    expect(output.drawStates).toEqual([{ alpha: 0.6, composite: 'source-over' }]);
  });
});
