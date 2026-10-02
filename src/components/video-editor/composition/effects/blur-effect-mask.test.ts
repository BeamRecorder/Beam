import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { BlurClip } from '~/media/shared/composition-types';
import type { Canvas2DContext } from '~/types/canvas';
import type { GpuEffectInput } from '~/media/gpu/gpu-filter-types';
import { applyBlurEffect, disposeBlurEffect } from './blur-effect';

// Geometry surfaces and GPU submissions are recorded independently of real GPU pixels.
const gpu = vi.hoisted(() => ({
  create: vi.fn(),
  render: vi.fn<(input: GpuEffectInput) => OffscreenCanvas>(),
  dispose: vi.fn(),
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
});
afterEach(() => {
  for (const context of outputs) disposeBlurEffect(cast(context));
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('GPU mask geometry ownership', () => {
  it('reuses explicitly immutable custom geometry and invalidates changed keys', () => {
    const target = output(),
      path = vi.fn((context: Canvas2DContext) => context.beginPath());
    applyBlurEffect(cast(target), clip(), rect, { maskPath: path, maskCacheKey: 'a' });
    applyBlurEffect(cast(target), clip(), rect, { maskPath: path, maskCacheKey: 'a' });
    applyBlurEffect(cast(target), clip(), rect, { maskPath: path, maskCacheKey: 'b' });
    expect(path).toHaveBeenCalledTimes(2);
    expect(input().mask).toBe(input(1).mask);
    expect(input(2).mask).not.toBe(input().mask);
  });
  it.each([undefined, ''])('redraws dynamic callback with key %s', (key) => {
    const target = output(),
      path = vi.fn((context: Canvas2DContext) => context.beginPath());
    applyBlurEffect(cast(target), clip(), rect, { maskPath: path, maskCacheKey: key });
    applyBlurEffect(cast(target), clip(), rect, { maskPath: path, maskCacheKey: key });
    expect(path).toHaveBeenCalledTimes(2);
    expect(canvases).toHaveLength(2);
    expect(canvases[1]!.context.clearRect).toHaveBeenCalledTimes(2);
  });
  it('passes original mask size while rotated bounds drive the sampled source region', () => {
    const path = vi.fn(
      (_context: Canvas2DContext, _rect: { x: number; y: number; width: number; height: number }) => undefined,
    );
    applyBlurEffect(
      cast(output()),
      clip(),
      { x: 200, y: 150, width: 120, height: 60 },
      { bounds: { x: 180, y: 120, width: 160, height: 120 }, maskPath: path },
    );
    expect(path.mock.calls[0]![1]).toMatchObject({ width: 120, height: 60 });
    expect(input().target).toMatchObject({ width: 160, height: 120 });
  });
  it('preserves catalog callbacks that fill artwork then leave an empty current path', () => {
    const path = vi.fn((context: Canvas2DContext) => {
      context.fill();
      context.beginPath();
    });
    applyBlurEffect(cast(output()), clip(), rect, { maskPath: path });
    expect(canvases[1]!.context.fill).toHaveBeenCalledTimes(2);
    expect(canvases[1]!.context.beginPath).toHaveBeenCalledTimes(2);
    expect(canvases[1]!.context.fill.mock.calls).toEqual([[], []]);
  });
  it('preserves nonzero winding when custom blur geometry contains overlapping contours', () => {
    applyBlurEffect(cast(output()), clip(), rect, {
      maskPath: (context) => {
        context.beginPath();
        context.rect(10, 20, 30, 40);
        context.rect(20, 20, 30, 40);
      },
    });
    expect(canvases[1]!.context.rect.mock.calls).toEqual([
      [10, 20, 30, 40],
      [20, 20, 30, 40],
    ]);
    expect(canvases[1]!.context.fill).toHaveBeenCalledExactlyOnceWith();
    expect(canvases[1]!.context.globalCompositeOperation).toBe('source-over');
    expect(input().maskImmutable).toBe(false);
  });
  it('releases a new immutable mask if its callback fails before cache ownership transfer', () => {
    const target = output();
    expect(() =>
      applyBlurEffect(cast(target), clip(), rect, {
        maskCacheKey: 'failed',
        maskPath: () => {
          throw new Error('mask callback');
        },
      }),
    ).toThrow('mask callback');
    expect(canvases[2]).toMatchObject({ width: 0, height: 0 });
    expect(gpu.render).not.toHaveBeenCalled();
    applyBlurEffect(cast(target), clip(), rect, {
      maskCacheKey: 'failed',
      maskPath: (context) => context.rect(1, 1, 2, 2),
    });
    expect(input().mask).toBe(canvases[3]);
    expect(input().maskImmutable).toBe(true);
  });
  it('keeps a failed dynamic mask owned and clears it before later reuse', () => {
    const target = output();
    expect(() =>
      applyBlurEffect(cast(target), clip(), rect, {
        maskPath: () => {
          throw new Error('dynamic mask');
        },
      }),
    ).toThrow('dynamic mask');
    applyBlurEffect(cast(target), clip(), rect, { maskPath: (context) => context.rect(1, 1, 2, 2) });
    expect(canvases).toHaveLength(2);
    expect(canvases[1]!.context.clearRect).toHaveBeenCalledTimes(2);
    expect(input().mask).toBe(canvases[1]);
    expect(input().maskImmutable).toBe(false);
  });
  it('releases a new retained mask if painting its completed path fails', () => {
    const target = output();
    expect(() =>
      applyBlurEffect(cast(target), clip(), rect, {
        maskCacheKey: 'fill-failed',
        maskPath: (context) => {
          vi.mocked(context.fill).mockImplementationOnce(() => {
            throw new Error('mask fill');
          });
        },
      }),
    ).toThrow('mask fill');
    expect(canvases[2]).toMatchObject({ width: 0, height: 0 });
    expect(target.drawImage).not.toHaveBeenCalled();
  });
  it('retains compact masks independently of previously large effects', () => {
    const target = output(1920, 1080),
      effect = clip({ mode: 'opaque' });
    applyBlurEffect(cast(target), effect, { x: 0, y: 0, width: 1800, height: 960 });
    applyBlurEffect(cast(target), effect, rect);
    expect(input(1).mask).toMatchObject({ width: 54, height: 44 });
    expect(canvases[3]!.context.drawImage).not.toHaveBeenCalled();
  });
  it('stops retaining at the entry budget instead of churning allocations', () => {
    const target = output(4096, 4096),
      effect = clip({ mode: 'opaque' });
    for (let index = 0; index < 1026; index++)
      applyBlurEffect(cast(target), effect, rect, {
        maskPath: (context) => context.rect(1, 1, 2, 2),
        maskCacheKey: `unique:${index}`,
      });
    expect(canvases).toHaveLength(1026);
    expect(input(1025).mask).toBe(canvases[1]);
    expect(canvases[1]!.context.fill).toHaveBeenCalledTimes(2);
  });
  it('disposes every GPU, scratch and cached mask once then permits fresh rendering', () => {
    const target = output();
    applyBlurEffect(cast(target), clip(), rect);
    disposeBlurEffect(cast(target));
    disposeBlurEffect(cast(target));
    expect(gpu.dispose).toHaveBeenCalledOnce();
    expect(canvases.every((value) => !value.width && !value.height)).toBe(true);
    applyBlurEffect(cast(target), clip(), rect);
    expect(gpu.create).toHaveBeenCalledTimes(2);
    expect(canvases.slice(3).every((value) => value.width > 0)).toBe(true);
  });
  it('keeps other output allocations alive during disposal', () => {
    const a = output(),
      b = output();
    applyBlurEffect(cast(a), clip(), rect);
    applyBlurEffect(cast(b), clip(), rect);
    disposeBlurEffect(cast(a));
    expect(canvases.slice(0, 3).every((value) => !value.width)).toBe(true);
    expect(canvases.slice(3).every((value) => value.width > 0)).toBe(true);
  });
  it('does nothing for missing and unused output owners', () => {
    disposeBlurEffect(null);
    disposeBlurEffect(cast(output()));
    expect(gpu.create).not.toHaveBeenCalled();
    expect(gpu.dispose).not.toHaveBeenCalled();
  });
  it('releases GPU ownership when allocating a geometry context fails', () => {
    vi.stubGlobal(
      'OffscreenCanvas',
      class {
        getContext() {
          return null;
        }
      },
    );
    expect(() => applyBlurEffect(cast(output()), clip(), rect)).toThrow('GPU effect geometry context unavailable');
    expect(gpu.dispose).toHaveBeenCalledOnce();
  });
  it('propagates GPU initialization failure without allocating a stale native replacement', () => {
    gpu.create.mockImplementationOnce(() => {
      throw new Error('GPU unavailable');
    });
    expect(() => applyBlurEffect(cast(output()), clip(), rect)).toThrow('GPU unavailable');
    expect(canvases).toHaveLength(0);
    expect(gpu.render).not.toHaveBeenCalled();
  });
  it('releases the previously created source if allocating the mask context fails', () => {
    vi.spyOn(Canvas.prototype, 'getContext')
      .mockReturnValueOnce(new Context({ width: 1, height: 1 }))
      .mockReturnValueOnce(null as unknown as Context);
    expect(() => applyBlurEffect(cast(output()), clip(), rect)).toThrow('GPU effect geometry context unavailable');
    expect(gpu.dispose).toHaveBeenCalledOnce();
    expect(canvases[0]).toMatchObject({ width: 0, height: 0 });
  });
});
