import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { BlurClip } from '~/media/shared/composition-types';
import type { Canvas2DContext } from '~/types/canvas';
import type { GpuEffectInput } from '~/media/gpu/gpu-filter-types';
import { applyBlurEffect, disposeBlurEffect, withGpuBlurGroup } from './blur-effect';
import { effectShapeRect } from './effect-shape';

const gpu = vi.hoisted(() => ({
  create: vi.fn(),
  render: vi.fn<(input: GpuEffectInput) => OffscreenCanvas>(),
  dispose: vi.fn(),
  begin: vi.fn(),
  apply: vi.fn(),
  present: vi.fn(),
  cancel: vi.fn(),
}));
vi.mock('~/media/gpu/gpu-effects-renderer', () => ({
  GpuEffectsRenderer: class {
    constructor() {
      gpu.create();
    }
    render(input: GpuEffectInput) {
      return gpu.render(input);
    }
    dispose() {
      gpu.dispose();
    }
    begin(...args: unknown[]) {
      gpu.begin(...args);
    }
    apply(...args: unknown[]) {
      gpu.apply(...args);
    }
    present() {
      return gpu.present();
    }
    cancel() {
      gpu.cancel();
    }
  },
}));
type Matrix = { a: number; b: number; c: number; d: number; e: number; f: number };
class Context {
  readonly canvas: { width: number; height: number };
  filter = 'none';
  globalAlpha = 1;
  globalCompositeOperation = 'source-over';
  fillStyle = '#000000';
  matrix: Matrix = { a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 };
  readonly stack: Array<{ matrix: Matrix; composite: string }> = [];
  save = vi.fn(() => this.stack.push({ matrix: { ...this.matrix }, composite: this.globalCompositeOperation }));
  restore = vi.fn(() => {
    const saved = this.stack.pop()!;
    this.matrix = saved.matrix;
    this.globalCompositeOperation = saved.composite;
  });
  setTransform = vi.fn((a: number, b: number, c: number, d: number, e: number, f: number) => {
    this.matrix = { a, b, c, d, e, f };
  });
  getTransform = vi.fn(() => ({ ...this.matrix }));
  drawImage = vi.fn();
  clearRect = vi.fn();
  beginPath = vi.fn();
  rect = vi.fn();
  clip = vi.fn();
  fillRect = vi.fn();
  roundRect = vi.fn();
  arc = vi.fn();
  moveTo = vi.fn();
  fill = vi.fn();
  constructor(canvas: { width: number; height: number }) {
    this.canvas = canvas;
  }
}
class Canvas {
  context: Context;
  width: number;
  height: number;
  constructor(width: number, height: number) {
    this.width = width;
    this.height = height;
    this.context = new Context(this);
    canvases.push(this);
  }
  getContext() {
    return this.context;
  }
}
const canvases: Canvas[] = [],
  outputs: Context[] = [];
const output = (width = 800, height = 450) => {
  const context = new Context({ width, height });
  outputs.push(context);
  return context;
};
const cast = (context: Context) => context as unknown as Canvas2DContext;
const clip = (changes: Partial<BlurClip> = {}): BlurClip => ({
  id: 'blur',
  kind: 'blur',
  assetId: '',
  name: 'Blur',
  timelineStartMs: 0,
  timelineDurationMs: 5000,
  sourceInMs: 0,
  sourceDurationMs: 5000,
  playbackRate: 1,
  enabled: true,
  order: 0,
  transform: { x: 0.2, y: 0.2, width: 0.3, height: 0.2 },
  shape: 'rectangle',
  mode: 'blur',
  strength: 60,
  feather: 0,
  cornerRadius: 0,
  tintOpacity: 0,
  color: '#000000',
  ...changes,
});
const rect = { x: 100, y: 100, width: 50, height: 40 };
const input = (index = 0) => gpu.render.mock.calls[index]![0];
beforeEach(() => {
  vi.clearAllMocks();
  canvases.length = 0;
  outputs.length = 0;
  vi.stubGlobal('OffscreenCanvas', Canvas);
  gpu.render.mockImplementation((value) => ({ width: value.width, height: value.height }) as OffscreenCanvas);
  gpu.present.mockImplementation(() => ({ width: 800, height: 450 }) as OffscreenCanvas);
});
afterEach(() => {
  for (const context of outputs) disposeBlurEffect(cast(context));
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('single GPU effect bridge', () => {
  it('routes a bounded live crop and actual Gaussian sigma to the GPU', () => {
    const target = output();
    applyBlurEffect(cast(target), clip(), rect);
    expect(input()).toMatchObject({ mode: 'blur', feather: 0, maskPadding: 0 });
    expect(input().sigma).toBeCloseTo(28.8);
    expect(input().width).toBeLessThan(target.canvas.width);
    expect(input().height).toBeLessThan(target.canvas.height);
    expect(canvases[0]!.context.drawImage).toHaveBeenCalledWith(
      target.canvas,
      expect.any(Number),
      expect.any(Number),
      input().width,
      input().height,
      0,
      0,
      input().width,
      input().height,
    );
    expect(target.drawImage).toHaveBeenCalledOnce();
    expect(canvases.every((value) => value.context.filter === 'none')).toBe(true);
  });
  it.each(['frosted', 'pixelated', 'opaque'] as const)('routes %s through the same GPU owner', (mode) => {
    applyBlurEffect(
      cast(output()),
      clip({ mode, strength: 100, tintOpacity: 25, color: '#12345680', feather: 20 }),
      rect,
    );
    expect(input()).toMatchObject({ mode, sigma: mode === 'frosted' ? 48 : 0, strength: 100, tintOpacity: 25 });
    expect(input().color).toEqual([0x12 / 255, 0x34 / 255, 0x56 / 255, 0x80 / 255]);
    expect(input().feather).toBe(1.6);
    expect(input().maskPadding).toBe(7);
    expect(gpu.create).toHaveBeenCalledOnce();
    expect(canvases.every((value) => value.context.filter === 'none')).toBe(true);
    expect(canvases[0]!.context.drawImage).toHaveBeenCalledTimes(mode === 'opaque' ? 0 : 1);
  });
  it('renders zero-strength frosted tint instead of discarding an empty blur', () => {
    applyBlurEffect(cast(output()), clip({ mode: 'frosted', strength: 0, tintOpacity: 30 }), rect);
    expect(input()).toMatchObject({ mode: 'frosted', sigma: 0, tintOpacity: 30 });
  });
  it('reuses GPU and immutable mask but resamples the current source every time', () => {
    const target = output(),
      a = {} as CanvasImageSource,
      b = {} as CanvasImageSource;
    applyBlurEffect(cast(target), clip(), rect, { source: a });
    applyBlurEffect(cast(target), clip({ color: '#ffffff' }), rect, { source: b });
    expect(gpu.create).toHaveBeenCalledOnce();
    expect(input().mask).toBe(input(1).mask);
    expect(canvases[0]!.context.drawImage.mock.calls.map((args) => args[0])).toEqual([a, b]);
    expect(canvases[2]!.context.fill).toHaveBeenCalledOnce();
    expect(canvases[0]!.context.clearRect).toHaveBeenCalledTimes(2);
  });
  it('rasterizes rounded and circle geometry without native filtering', () => {
    const target = output();
    applyBlurEffect(cast(target), clip({ mode: 'opaque', cornerRadius: 50 }), rect);
    expect(canvases[2]!.context.roundRect).toHaveBeenCalledWith(2, 2, 50, 40, 10);
    applyBlurEffect(cast(target), clip({ mode: 'opaque', shape: 'circle' }), rect);
    expect(canvases[3]!.context.arc).toHaveBeenCalledWith(22, 22, 20, 0, Math.PI * 2);
    expect(canvases.every((value) => value.context.filter === 'none')).toBe(true);
  });
  it('preserves alpha, blend, filter and affine state during presentation', () => {
    const target = output();
    target.globalAlpha = 0.4;
    target.globalCompositeOperation = 'multiply';
    target.filter = 'contrast(1.2)';
    target.matrix = { a: 2, b: 0.25, c: 0.1, d: 2, e: 10, f: 15 };
    const initial = { ...target.matrix };
    target.drawImage.mockImplementation(() => {
      expect(target.matrix).toEqual({ a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 });
      expect(target.globalAlpha).toBe(0.4);
      expect(target.globalCompositeOperation).toBe('multiply');
      expect(target.filter).toBe('contrast(1.2)');
    });
    applyBlurEffect(cast(target), clip(), rect);
    expect(target.save).toHaveBeenCalledOnce();
    expect(target.restore).toHaveBeenCalledOnce();
    expect(target.matrix).toEqual(initial);
  });
  it('restores output affine state when presentation throws', () => {
    const target = output();
    target.matrix.e = 17;
    target.drawImage.mockImplementationOnce(() => {
      throw new Error('present failed');
    });
    expect(() => applyBlurEffect(cast(target), clip(), rect)).toThrow('present failed');
    expect(target.restore).toHaveBeenCalledOnce();
    expect(target.matrix.e).toBe(17);
  });
  it('does not paint stale results or alter output state when GPU rendering fails', () => {
    const target = output();
    target.matrix.e = 12;
    gpu.render.mockImplementationOnce(() => {
      throw new Error('context lost');
    });
    expect(() => applyBlurEffect(cast(target), clip(), rect)).toThrow('context lost');
    expect(target.save).toHaveBeenCalledOnce();
    expect(target.restore).toHaveBeenCalledOnce();
    expect(target.matrix.e).toBe(12);
    expect(target.drawImage).not.toHaveBeenCalled();
  });
  it('uses sharp geometry for clips without a corner radius', () => {
    applyBlurEffect(cast(output()), clip({ mode: 'opaque', cornerRadius: undefined }), rect);
    expect(canvases[2]!.context.rect).toHaveBeenCalledWith(2, 2, 50, 40);
    expect(canvases[2]!.context.roundRect).not.toHaveBeenCalled();
  });
  it.each(['#123', '#12345g', 'red', 'rgb(1,2,3)', '#123456789'])(
    'rejects invalid color %s before allocation',
    (color) => {
      expect(() => applyBlurEffect(cast(output()), clip({ color }), rect)).toThrow('Invalid GPU effect color');
      expect(gpu.create).not.toHaveBeenCalled();
      expect(canvases).toHaveLength(0);
    },
  );
  it('rejects invalid highlight color before allocating an ordinary effect', () => {
    expect(() => applyBlurEffect(cast(output()), clip({ highlightColor: 'broken' }), rect)).toThrow(RangeError);
    expect(gpu.create).not.toHaveBeenCalled();
  });
  it('does not allocate for empty, offscreen or zero-strength blur requests', () => {
    const target = output();
    applyBlurEffect(cast(target), clip({ strength: 0 }), rect);
    applyBlurEffect(cast(target), clip(), { ...rect, width: 0 });
    applyBlurEffect(cast(target), clip(), { ...rect, height: -1 });
    applyBlurEffect(cast(target), clip(), { ...rect, x: 10000 });
    applyBlurEffect(cast(output(0)), clip(), rect);
    expect(gpu.create).not.toHaveBeenCalled();
    expect(canvases).toHaveLength(0);
  });
});

describe('retained GPU blur group bridge', () => {
  it('uploads one live backdrop and presents once for multiple ordered effects', () => {
    const target = output();
    target.drawImage.mockImplementation(() => {
      expect(target.globalCompositeOperation).toBe('copy');
    });
    withGpuBlurGroup(cast(target), () => {
      applyBlurEffect(cast(target), clip(), rect);
      applyBlurEffect(cast(target), clip({ mode: 'frosted', tintOpacity: 25 }), { ...rect, x: 120 });
    });
    expect(gpu.begin).toHaveBeenCalledOnce();
    expect(gpu.begin).toHaveBeenCalledWith(target.canvas, 800, 450);
    expect(gpu.apply).toHaveBeenCalledTimes(2);
    expect(gpu.apply.mock.calls.map((args) => args[0].mode)).toEqual(['blur', 'frosted']);
    expect(gpu.render).not.toHaveBeenCalled();
    expect(canvases[0]!.context.drawImage).not.toHaveBeenCalled();
    expect(gpu.present).toHaveBeenCalledOnce();
    expect(gpu.cancel).toHaveBeenCalledOnce();
    expect(target.drawImage).toHaveBeenCalledOnce();
    expect(target.globalCompositeOperation).toBe('source-over');
    expect(target.clip).not.toHaveBeenCalled();
  });
  it('uploads one cropped backdrop, shifts effects locally and clips COPY to the exact ROI', () => {
    const target = output(),
      region = { x: 50, y: 50, width: 250, height: 150 };
    target.matrix.e = 12;
    withGpuBlurGroup(
      cast(target),
      () => {
        target.matrix.e = 0;
        applyBlurEffect(cast(target), clip({ mode: 'opaque' }), rect);
        applyBlurEffect(cast(target), clip({ mode: 'pixelated' }), { ...rect, x: 120, y: 110 });
        target.matrix.e = 12;
      },
      region,
    );
    expect(canvases[0]!.context.drawImage).toHaveBeenCalledOnce();
    expect(canvases[0]!.context.drawImage).toHaveBeenCalledWith(target.canvas, 50, 50, 250, 150, 0, 0, 250, 150);
    expect(gpu.begin).toHaveBeenCalledWith(canvases[0], 250, 150);
    expect(gpu.apply.mock.calls.map((args) => args[1])).toEqual([
      { x: 48, y: 48, width: 54, height: 44 },
      { x: 68, y: 58, width: 54, height: 44 },
    ]);
    expect(gpu.apply.mock.calls.map((args) => args[0].target)).toEqual([
      { x: 2, y: 2, width: 50, height: 40 },
      { x: 2, y: 2, width: 50, height: 40 },
    ]);
    expect(target.rect).toHaveBeenCalledWith(50, 50, 250, 150);
    expect(target.clip).toHaveBeenCalledOnce();
    expect(target.clip.mock.invocationCallOrder[0]).toBeLessThan(target.drawImage.mock.invocationCallOrder[0]!);
    expect(target.drawImage).toHaveBeenCalledWith(expect.any(Object), 0, 0, 250, 150, 50, 50, 250, 150);
    expect(target.restore).toHaveBeenCalledOnce();
    expect(target.matrix.e).toBe(12);
    expect(target.globalCompositeOperation).toBe('source-over');
  });
  it.each([
    { x: -1 },
    { y: -1 },
    { width: 0 },
    { height: 0 },
    { width: -1 },
    { height: -1 },
    { x: 0.5 },
    { y: 0.5 },
    { width: 10.5 },
    { height: 10.5 },
    { x: NaN },
    { y: Infinity },
    { x: 751 },
    { y: 411 },
    { width: 751 },
    { height: 401 },
  ])('rejects invalid crop bounds %j before background transfer or draw', (changes) => {
    const target = output(),
      draw = vi.fn();
    expect(() => withGpuBlurGroup(cast(target), draw, { x: 50, y: 50, width: 50, height: 40, ...changes })).toThrow(
      'Invalid GPU group bounds',
    );
    expect(draw).not.toHaveBeenCalled();
    expect(gpu.begin).not.toHaveBeenCalled();
    expect(target.drawImage).not.toHaveBeenCalled();
    expect(canvases[0]!.context.drawImage).not.toHaveBeenCalled();
  });
  it('accepts an integer crop ending exactly at the canvas boundary', () => {
    const target = output();
    withGpuBlurGroup(cast(target), () => undefined, { x: 750, y: 410, width: 50, height: 40 });
    expect(gpu.begin).toHaveBeenCalledWith(canvases[0], 50, 40);
    expect(target.rect).toHaveBeenCalledWith(750, 410, 50, 40);
    expect(gpu.present).toHaveBeenCalledOnce();
  });
  it('clears a failed cropped group origin before a later full-frame group', () => {
    const target = output();
    expect(() =>
      withGpuBlurGroup(
        cast(target),
        () => {
          applyBlurEffect(cast(target), clip({ mode: 'opaque' }), rect);
          throw new Error('crop abort');
        },
        { x: 50, y: 50, width: 250, height: 150 },
      ),
    ).toThrow('crop abort');
    expect(gpu.apply.mock.calls[0]![1]).toEqual({ x: 48, y: 48, width: 54, height: 44 });
    expect(gpu.present).not.toHaveBeenCalled();
    expect(target.clip).not.toHaveBeenCalled();
    expect(gpu.cancel).toHaveBeenCalledOnce();
    withGpuBlurGroup(cast(target), () => applyBlurEffect(cast(target), clip({ mode: 'opaque' }), rect));
    expect(gpu.apply.mock.calls[1]![1]).toEqual({ x: 98, y: 98, width: 54, height: 44 });
    expect(gpu.begin.mock.calls[1]).toEqual([target.canvas, 800, 450]);
    expect(gpu.cancel).toHaveBeenCalledTimes(2);
  });
  it('restores clipped presentation state and group origin after the ROI clip fails', () => {
    const target = output();
    target.matrix.e = 20;
    target.clip.mockImplementationOnce(() => {
      throw new Error('ROI clip');
    });
    expect(() => withGpuBlurGroup(cast(target), () => undefined, { x: 50, y: 50, width: 250, height: 150 })).toThrow(
      'ROI clip',
    );
    expect(target.restore).toHaveBeenCalledOnce();
    expect(target.matrix.e).toBe(20);
    expect(target.globalCompositeOperation).toBe('source-over');
    expect(target.drawImage).not.toHaveBeenCalled();
    expect(gpu.cancel).toHaveBeenCalledOnce();
    target.matrix.e = 0;
    withGpuBlurGroup(cast(target), () => applyBlurEffect(cast(target), clip({ mode: 'opaque' }), rect));
    expect(gpu.apply.mock.calls[0]![1]).toEqual({ x: 98, y: 98, width: 54, height: 44 });
  });
  it('does not keep a cropped group active if its GPU backdrop upload fails', () => {
    const target = output();
    gpu.begin.mockImplementationOnce(() => {
      throw new Error('crop upload');
    });
    expect(() => withGpuBlurGroup(cast(target), () => undefined, { x: 50, y: 50, width: 250, height: 150 })).toThrow(
      'crop upload',
    );
    expect(gpu.present).not.toHaveBeenCalled();
    expect(target.drawImage).not.toHaveBeenCalled();
    withGpuBlurGroup(cast(target), () => applyBlurEffect(cast(target), clip({ mode: 'opaque' }), rect));
    expect(gpu.apply.mock.calls[0]![1]).toEqual({ x: 98, y: 98, width: 54, height: 44 });
  });
  it('rejects nested groups and resets ownership so a later standalone request works', () => {
    const target = output();
    expect(() => withGpuBlurGroup(cast(target), () => withGpuBlurGroup(cast(target), () => undefined))).toThrow(
      'Nested GPU blur groups',
    );
    expect(gpu.present).not.toHaveBeenCalled();
    expect(gpu.cancel).toHaveBeenCalledOnce();
    applyBlurEffect(cast(target), clip(), rect);
    expect(gpu.render).toHaveBeenCalledOnce();
  });
  it('rejects external sources inside a retained group without publishing partial results', () => {
    const target = output();
    expect(() =>
      withGpuBlurGroup(cast(target), () =>
        applyBlurEffect(cast(target), clip(), rect, { source: {} as CanvasImageSource }),
      ),
    ).toThrow('live retained backdrop');
    expect(gpu.apply).not.toHaveBeenCalled();
    expect(gpu.present).not.toHaveBeenCalled();
    expect(gpu.cancel).toHaveBeenCalledOnce();
    expect(target.drawImage).not.toHaveBeenCalled();
  });
  it('cancels an aborted draw and does not replay its old group into the next render', () => {
    const target = output();
    expect(() =>
      withGpuBlurGroup(cast(target), () => {
        applyBlurEffect(cast(target), clip(), rect);
        throw new Error('abort');
      }),
    ).toThrow('abort');
    expect(gpu.present).not.toHaveBeenCalled();
    expect(gpu.cancel).toHaveBeenCalledOnce();
    applyBlurEffect(cast(target), clip(), rect);
    expect(gpu.render).toHaveBeenCalledOnce();
    expect(gpu.apply).toHaveBeenCalledOnce();
  });
  it('restores presentation state and cancels the retained group if copy fails', () => {
    const target = output();
    target.matrix.e = 20;
    target.drawImage.mockImplementationOnce(() => {
      throw new Error('copy failed');
    });
    expect(() => withGpuBlurGroup(cast(target), () => applyBlurEffect(cast(target), clip(), rect))).toThrow(
      'copy failed',
    );
    expect(target.restore).toHaveBeenCalledOnce();
    expect(target.matrix.e).toBe(20);
    expect(target.globalCompositeOperation).toBe('source-over');
    expect(gpu.cancel).toHaveBeenCalledOnce();
  });
});

describe('effect shape bounds', () => {
  it('preserves rectangle bounds', () => {
    expect(effectShapeRect('rectangle', rect)).toBe(rect);
  });
  it.each(['square', 'circle'] as const)('centers %s on the smaller dimension', (shape) => {
    expect(effectShapeRect(shape, rect)).toEqual({ x: 105, y: 100, width: 40, height: 40 });
    expect(effectShapeRect(shape, { x: 10, y: 20, width: 30, height: 50 })).toEqual({
      x: 10,
      y: 30,
      width: 30,
      height: 30,
    });
  });
});
