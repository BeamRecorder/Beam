import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { BlurClip } from '~/media/shared/composition-types';
import type { Canvas2DContext } from '~/types/canvas';
import type { GpuEffectInput } from '~/media/gpu/gpu-filter-types';
import { applyBlurEffect, disposeBlurEffect } from './blur-effect';
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
  canvas: { width: number; height: number };
  globalAlpha = 1;
  globalCompositeOperation = 'source-over';
  filter = 'none';
  fillStyle = '#000000';
  matrix: Matrix = { a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 };
  readonly saved: Matrix[] = [];
  getTransform = vi.fn(() => ({ ...this.matrix }));
  setTransform = vi.fn((a: number, b: number, c: number, d: number, e: number, f: number) => {
    this.matrix = { a, b, c, d, e, f };
  });
  save = vi.fn(() => this.saved.push({ ...this.matrix }));
  restore = vi.fn(() => {
    this.matrix = this.saved.pop()!;
  });
  drawImage = vi.fn();
  clearRect = vi.fn();
  beginPath = vi.fn();
  fill = vi.fn();
  rect = vi.fn();
  fillRect = vi.fn();
  roundRect = vi.fn();
  arc = vi.fn();
  moveTo = vi.fn();
  constructor(canvas: { width: number; height: number }) {
    this.canvas = canvas;
  }
}
const surfaces: Array<{ width: number; height: number; context: Context }> = [],
  outputs: Context[] = [];
// Geometry-only test canvases share identity with native sources without implementing their full DOM API.
const geometrySurface = (source: TexImageSource) => surfaces.find((surface) => (surface as unknown) === source)!;
const output = (width = 800, height = 600) => {
  const value = new Context({ width, height });
  outputs.push(value);
  return value;
};
const cast = (ctx: Context) => ctx as unknown as Canvas2DContext;
const highlight = (changes: Partial<BlurClip> = {}): BlurClip => ({
  id: 'highlight',
  kind: 'blur',
  assetId: '',
  name: 'Highlight',
  timelineStartMs: 0,
  timelineDurationMs: 5000,
  sourceInMs: 0,
  sourceDurationMs: 5000,
  playbackRate: 1,
  enabled: true,
  order: 0,
  transform: { x: 0.2, y: 0.2, width: 0.4, height: 0.3 },
  mode: 'highlight',
  shape: 'rectangle',
  strength: 50,
  feather: 0,
  cornerRadius: 0,
  tintOpacity: 0,
  color: '#ffcc00',
  ...changes,
});
const rect = { x: 10, y: 20, width: 100, height: 80 },
  input = (index = 0) => gpu.render.mock.calls[index]![0];
beforeEach(() => {
  vi.clearAllMocks();
  surfaces.length = 0;
  outputs.length = 0;
  vi.stubGlobal(
    'OffscreenCanvas',
    class {
      width: number;
      height: number;
      context: Context;
      constructor(width: number, height: number) {
        this.width = width;
        this.height = height;
        this.context = new Context(this);
        surfaces.push(this);
      }
      getContext() {
        return this.context;
      }
    },
  );
  gpu.render.mockImplementation((value) => ({ width: value.width, height: value.height }) as OffscreenCanvas);
});
afterEach(() => {
  for (const value of outputs) disposeBlurEffect(cast(value));
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});
describe('GPU inverse-mask highlight through the shared bridge', () => {
  it('routes hard outside tint to a full-frame GPU result', () => {
    const target = output();
    applyBlurEffect(cast(target), highlight(), rect);
    expect(input()).toMatchObject({
      mode: 'highlight',
      highlightStage: 'outside',
      sigma: 0,
      feather: 0,
      strength: 50,
      tintOpacity: 0,
      width: 800,
      height: 600,
    });
    expect(input().color).toEqual([1, 0.8, 0, 1]);
    expect(input().highlight).toEqual([1, 1, 1, 1]);
    expect(input().mask).toBe(surfaces[3]);
    expect(surfaces[3]!.context.rect.mock.calls).toEqual([
      [0, 0, 800, 600],
      [10, 20, 100, 80],
    ]);
    expect(surfaces[3]!.context.fill).toHaveBeenCalledExactlyOnceWith('evenodd');
    expect(target.drawImage).toHaveBeenCalledWith(expect.any(Object), 0, 0, 800, 600, 0, 0, 800, 600);
  });
  it('keeps exterior/interior opacity independent including color alpha', () => {
    applyBlurEffect(
      cast(output()),
      highlight({ strength: 30, tintOpacity: 45, color: '#ff000066', highlightColor: '#0000ff40' }),
      rect,
    );
    expect(gpu.render).toHaveBeenCalledTimes(2);
    expect(input()).toMatchObject({
      highlightStage: 'outside',
      strength: 30,
      tintOpacity: 45,
      color: [1, 0, 0, 0x66 / 255],
      highlight: [0, 0, 1, 0x40 / 255],
    });
    expect(input(1)).toMatchObject({ highlightStage: 'inside', strength: 30, tintOpacity: 45 });
    expect(input().mask).toBe(surfaces[3]);
    expect(input(1).mask).toBe(surfaces[2]);
    expect(input(1).mask).not.toBe(input().mask);
    expect(surfaces[3]!.context.fill).toHaveBeenCalledExactlyOnceWith('evenodd');
    expect(surfaces[2]!.context.fill).toHaveBeenCalledExactlyOnceWith();
  });
  it('repaints dynamic borrowed geometry to the correct fill rule before each hard layer', () => {
    const target = output(),
      rules: unknown[][] = [],
      path = vi.fn((context: Canvas2DContext) => context.rect(10, 20, 100, 80));
    gpu.render.mockImplementation((value) => {
      const mask = geometrySurface(value.mask);
      rules.push([value.highlightStage, ...mask.context.fill.mock.calls.at(-1)!]);
      return { width: value.width, height: value.height } as OffscreenCanvas;
    });
    applyBlurEffect(cast(target), highlight({ tintOpacity: 40 }), rect, { maskPath: path });
    expect(rules).toEqual([['outside'], ['inside']]);
    expect(input().maskImmutable).toBe(false);
    expect(input(1).maskImmutable).toBe(false);
    expect(input().mask).toBe(input(1).mask);
    expect(target.drawImage).toHaveBeenCalledTimes(2);
  });
  it('fills the outside backdrop before subtracting a custom path under its original affine transform', () => {
    const target = output(),
      composites: string[] = [];
    target.matrix = { a: 2, b: 0.25, c: -0.5, d: 3, e: 4, f: 6 };
    const initial = { ...target.matrix };
    const path = vi.fn((context: Canvas2DContext) => {
      composites.push(context.globalCompositeOperation);
      context.beginPath();
      context.rect(10, 20, 100, 80);
      expect(context.getTransform()).toEqual(initial);
    });
    applyBlurEffect(cast(target), highlight({ tintOpacity: 40 }), rect, { maskPath: path, maskCacheKey: 'custom' });
    const outside = surfaces[3]!.context;
    expect(composites).toEqual(['source-over', 'destination-out']);
    expect(outside.fillRect).toHaveBeenCalledExactlyOnceWith(0, 0, 800, 600);
    expect(outside.setTransform.mock.calls).toEqual([
      [1, 0, 0, 1, 0, 0],
      [2, 0.25, -0.5, 3, 4, 6],
    ]);
    expect(outside.setTransform.mock.invocationCallOrder[0]).toBeLessThan(
      outside.fillRect.mock.invocationCallOrder[0]!,
    );
    expect(outside.fillRect.mock.invocationCallOrder[0]).toBeLessThan(
      outside.setTransform.mock.invocationCallOrder[1]!,
    );
    expect(outside.fillRect.mock.invocationCallOrder[0]).toBeLessThan(path.mock.invocationCallOrder[1]!);
    expect(outside.rect).toHaveBeenCalledExactlyOnceWith(10, 20, 100, 80);
    expect(outside.fill).toHaveBeenCalledExactlyOnceWith();
    expect(input().mask).toBe(surfaces[3]);
    expect(input(1).mask).toBe(surfaces[2]);
    expect(surfaces[2]!.context.fillRect).not.toHaveBeenCalled();
    expect(outside.filter).toBe('none');
    expect(target.matrix).toEqual({ a: 2, b: 0.25, c: -0.5, d: 3, e: 4, f: 6 });
  });
  it('subtracts self-painted custom artwork even when its callback resets the current path', () => {
    const target = output(),
      fillStates: string[] = [];
    const path = vi.fn((context: Canvas2DContext) => {
      context.beginPath();
      context.rect(10, 20, 100, 80);
      fillStates.push(context.globalCompositeOperation);
      context.fill();
      context.beginPath();
    });
    applyBlurEffect(cast(target), highlight({ tintOpacity: 40 }), rect, {
      maskPath: path,
      maskCacheKey: 'self-painted',
    });
    expect(fillStates).toEqual(['source-over', 'destination-out']);
    expect(surfaces[3]!.context.fillRect).toHaveBeenCalledExactlyOnceWith(0, 0, 800, 600);
    expect(surfaces[3]!.context.fill.mock.calls).toEqual([[], []]);
    expect(surfaces[2]!.context.fill.mock.calls).toEqual([[], []]);
    expect(surfaces[3]!.context.beginPath).toHaveBeenCalledTimes(3);
    expect(gpu.render).toHaveBeenCalledTimes(2);
    expect(input().mask).not.toBe(input(1).mask);
  });
  it('preserves nonzero winding for overlapping custom contours on both sides', () => {
    const target = output(),
      rectangles = [
        [10, 20, 100, 80],
        [50, 20, 100, 80],
      ];
    const path = vi.fn((context: Canvas2DContext) => {
      context.beginPath();
      context.rect(10, 20, 100, 80);
      context.rect(50, 20, 100, 80);
    });
    applyBlurEffect(cast(target), highlight({ tintOpacity: 40 }), rect, {
      maskPath: path,
      maskCacheKey: 'overlapping',
    });
    expect(surfaces[2]!.context.rect.mock.calls).toEqual(rectangles);
    expect(surfaces[3]!.context.rect.mock.calls).toEqual(rectangles);
    expect(surfaces[2]!.context.fill).toHaveBeenCalledExactlyOnceWith();
    expect(surfaces[3]!.context.fill).toHaveBeenCalledExactlyOnceWith();
    expect(surfaces[3]!.context.fillRect).toHaveBeenCalledExactlyOnceWith(0, 0, 800, 600);
    expect(surfaces[2]!.context.globalCompositeOperation).toBe('source-over');
    expect(surfaces[3]!.context.globalCompositeOperation).toBe('destination-out');
    expect(input().mask).toBe(surfaces[3]);
    expect(input(1).mask).toBe(surfaces[2]);
  });
  it('resets a failed dynamic destination-out mask before later outside and inside draws', () => {
    const target = output(),
      composites: string[] = [],
      rendered: unknown[][] = [];
    let fail = true;
    const path = vi.fn((context: Canvas2DContext) => {
      composites.push(context.globalCompositeOperation);
      if (context.globalCompositeOperation === 'destination-out' && fail) {
        fail = false;
        throw new Error('outside path');
      }
      context.beginPath();
      context.rect(10, 20, 100, 80);
    });
    gpu.render.mockImplementation((value) => {
      const mask = geometrySurface(value.mask);
      rendered.push([value.highlightStage, mask.context.globalCompositeOperation]);
      return { width: value.width, height: value.height } as OffscreenCanvas;
    });
    expect(() => applyBlurEffect(cast(target), highlight({ tintOpacity: 40 }), rect, { maskPath: path })).toThrow(
      'outside path',
    );
    expect(gpu.render).not.toHaveBeenCalled();
    expect(target.drawImage).not.toHaveBeenCalled();
    expect(target.restore).toHaveBeenCalledOnce();
    applyBlurEffect(cast(target), highlight({ tintOpacity: 40 }), rect, { maskPath: path });
    expect(composites).toEqual(['source-over', 'destination-out', 'source-over', 'destination-out', 'source-over']);
    expect(rendered).toEqual([
      ['outside', 'destination-out'],
      ['inside', 'source-over'],
    ]);
    expect(target.drawImage).toHaveBeenCalledTimes(2);
    expect(target.restore).toHaveBeenCalledTimes(2);
  });
  it('repaints hard inside geometry after the full-HD immutable mask budget is exhausted', () => {
    const target = output(1920, 1080),
      rules: unknown[][] = [];
    gpu.render.mockImplementation((value) => {
      const mask = geometrySurface(value.mask);
      rules.push([value.highlightStage, ...mask.context.fill.mock.calls.at(-1)!]);
      return { width: value.width, height: value.height } as OffscreenCanvas;
    });
    for (let index = 0; index < 3; index++)
      applyBlurEffect(cast(target), highlight({ tintOpacity: 40 }), { ...rect, x: 10 + index * 20 });
    expect(rules).toEqual([
      ['outside', 'evenodd'],
      ['inside'],
      ['outside', 'evenodd'],
      ['inside'],
      ['outside', 'evenodd'],
      ['inside'],
    ]);
    expect(input(4).maskImmutable).toBe(false);
    expect(input(5).maskImmutable).toBe(false);
    expect(input(4).mask).toBe(input(5).mask);
    expect(target.drawImage).toHaveBeenCalledTimes(6);
    expect(surfaces).toHaveLength(6);
  });
  it('uses white for clips without an explicit interior color', () => {
    applyBlurEffect(cast(output()), highlight({ tintOpacity: 40, highlightColor: undefined }), rect);
    expect(input().highlight).toEqual([1, 1, 1, 1]);
    expect(input().tintOpacity).toBe(40);
  });
  it('renders interior illumination even with zero outside strength', () => {
    applyBlurEffect(cast(output()), highlight({ strength: 0, tintOpacity: 40, highlightColor: '#22aaee' }), rect);
    expect(input()).toMatchObject({
      highlightStage: 'inside',
      strength: 0,
      tintOpacity: 40,
      highlight: [0x22 / 255, 0xaa / 255, 0xee / 255, 1],
    });
    expect(gpu.render).toHaveBeenCalledOnce();
  });
  it('rasterizes circles and rounded squares without native filtering', () => {
    const target = output();
    applyBlurEffect(cast(target), highlight({ shape: 'circle' }), rect);
    expect(input().mask).toBe(surfaces[3]);
    expect(surfaces[3]!.context.arc).toHaveBeenCalledWith(60, 60, 40, 0, Math.PI * 2);
    expect(surfaces[3]!.context.rect).toHaveBeenCalledExactlyOnceWith(0, 0, 800, 600);
    expect(surfaces[3]!.context.fill).toHaveBeenCalledExactlyOnceWith('evenodd');
    applyBlurEffect(cast(target), highlight({ shape: 'square', cornerRadius: 50 }), rect);
    expect(input(1).mask).toBe(surfaces[5]);
    expect(surfaces[5]!.context.roundRect).toHaveBeenCalledWith(20, 20, 80, 80, 20);
    expect(surfaces[5]!.context.fill).toHaveBeenCalledExactlyOnceWith('evenodd');
    expect(surfaces.every((value) => value.context.filter === 'none')).toBe(true);
  });
  it('retains affine geometry while supplying a padded mask for GPU feathering', () => {
    const target = output();
    target.matrix = { a: 2, b: 0.25, c: -0.5, d: 3, e: 4, f: 6 };
    const initial = { ...target.matrix };
    applyBlurEffect(cast(target), highlight({ feather: 25 }), rect);
    const feather = (Math.hypot(2, 0.25) * 80 * 25) / 500,
      padding = Math.ceil(feather * 3) + 2;
    expect(input().feather).toBeCloseTo(feather);
    expect(input().maskPadding).toBe(padding);
    expect(surfaces[2]).toMatchObject({ width: 800 + padding * 2, height: 600 + padding * 2 });
    expect(surfaces[2]!.context.matrix).toEqual({ ...initial, e: 4 + padding, f: 6 + padding });
    expect(target.matrix).toEqual(initial);
  });
  it('reuses geometry across color changes but invalidates changed matrix or output size', () => {
    const target = output();
    applyBlurEffect(cast(target), highlight({ feather: 25 }), rect);
    applyBlurEffect(cast(target), highlight({ feather: 25, strength: 20, tintOpacity: 70, color: '#123456' }), rect);
    expect(input().mask).toBe(input(1).mask);
    expect(surfaces[2]!.context.fill).toHaveBeenCalledOnce();
    target.matrix.e = 1;
    applyBlurEffect(cast(target), highlight({ feather: 25 }), rect);
    expect(input(2).mask).not.toBe(input().mask);
    target.canvas.width = 1000;
    applyBlurEffect(cast(target), highlight({ feather: 25 }), rect);
    expect(input(3).width).toBe(1000);
    expect(input(3).mask).not.toBe(input(2).mask);
  });
  it('preserves transition alpha and inherited blend/filter on presentation', () => {
    const target = output();
    target.globalAlpha = 0.6;
    target.globalCompositeOperation = 'screen';
    target.filter = 'contrast(1.2)';
    target.drawImage.mockImplementation(() => {
      expect(target.globalAlpha).toBe(0.6);
      expect(target.globalCompositeOperation).toBe('screen');
      expect(target.filter).toBe('contrast(1.2)');
    });
    applyBlurEffect(cast(target), highlight({ feather: 25 }), rect);
    expect(target.restore).toHaveBeenCalledOnce();
    expect(target.globalAlpha).toBe(0.6);
  });
  it('presents hard outside then inside as two independent inherited-alpha and blend layers', () => {
    const target = output(),
      events: string[] = [];
    target.matrix.e = 12;
    target.globalAlpha = 0.35;
    target.globalCompositeOperation = 'multiply';
    target.filter = 'contrast(1.2)';
    gpu.render.mockImplementation((value) => {
      events.push(`render:${value.highlightStage}`);
      return { width: value.width, height: value.height, stage: value.highlightStage } as unknown as OffscreenCanvas;
    });
    target.drawImage.mockImplementation((result) => {
      events.push(`paint:${result.stage}`);
      expect(target.globalAlpha).toBe(0.35);
      expect(target.globalCompositeOperation).toBe('multiply');
      expect(target.filter).toBe('contrast(1.2)');
      expect(target.matrix).toEqual({ a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 });
    });
    applyBlurEffect(cast(target), highlight({ tintOpacity: 60 }), rect);
    expect(events).toEqual(['render:outside', 'paint:outside', 'render:inside', 'paint:inside']);
    expect(target.save).toHaveBeenCalledOnce();
    expect(target.restore).toHaveBeenCalledOnce();
    expect(target.matrix.e).toBe(12);
    expect(input().mask).toBe(surfaces[3]);
    expect(input(1).mask).toBe(surfaces[2]);
    expect(surfaces[3]!.context.fill).toHaveBeenCalledExactlyOnceWith('evenodd');
    expect(surfaces[0]!.context.drawImage).not.toHaveBeenCalled();
  });
  it('combines feathered outside and inside in one inherited-state presentation', () => {
    const target = output();
    target.globalAlpha = 0.45;
    target.globalCompositeOperation = 'screen';
    target.drawImage.mockImplementation(() => {
      expect(target.globalAlpha).toBe(0.45);
      expect(target.globalCompositeOperation).toBe('screen');
    });
    applyBlurEffect(cast(target), highlight({ feather: 25, tintOpacity: 60 }), rect);
    expect(gpu.render).toHaveBeenCalledOnce();
    expect(input()).toMatchObject({ highlightStage: undefined, strength: 50, tintOpacity: 60 });
    expect(target.drawImage).toHaveBeenCalledOnce();
    expect(target.restore).toHaveBeenCalledOnce();
  });
  it.each([
    { feather: 0.18, renders: 2 },
    { feather: 0.2, renders: 1 },
  ])('uses the hard/feathered presentation boundary at feather $feather', ({ feather, renders }) => {
    applyBlurEffect(cast(output()), highlight({ feather, tintOpacity: 60 }), rect);
    expect(gpu.render).toHaveBeenCalledTimes(renders);
    expect(input().highlightStage).toBe(renders === 2 ? 'outside' : undefined);
  });
  it('restores inherited state and never paints a stale second layer if inside rendering fails', () => {
    const target = output();
    target.matrix.f = 14;
    gpu.render
      .mockImplementationOnce((value) => ({ width: value.width, height: value.height }) as OffscreenCanvas)
      .mockImplementationOnce(() => {
        throw new Error('inside failed');
      });
    expect(() => applyBlurEffect(cast(target), highlight({ tintOpacity: 60 }), rect)).toThrow('inside failed');
    expect(target.drawImage).toHaveBeenCalledOnce();
    expect(target.restore).toHaveBeenCalledOnce();
    expect(target.matrix.f).toBe(14);
    applyBlurEffect(cast(target), highlight({ tintOpacity: 60 }), rect);
    expect(target.drawImage).toHaveBeenCalledTimes(3);
  });
  it('restores affine state when presentation fails', () => {
    const target = output();
    target.matrix.f = 14;
    target.drawImage.mockImplementationOnce(() => {
      throw new Error('presentation');
    });
    expect(() => applyBlurEffect(cast(target), highlight(), rect)).toThrow('presentation');
    expect(target.restore).toHaveBeenCalledOnce();
    expect(target.matrix.f).toBe(14);
  });
  it('does no work for transparent highlights or empty shapes/canvases', () => {
    const target = output();
    applyBlurEffect(cast(target), highlight({ strength: 0, tintOpacity: 0 }), rect);
    applyBlurEffect(cast(target), highlight(), { ...rect, width: 0 });
    applyBlurEffect(cast(target), highlight(), { ...rect, height: 0 });
    applyBlurEffect(cast(output(0)), highlight(), rect);
    applyBlurEffect(cast(output(800, 0)), highlight(), rect);
    expect(gpu.create).not.toHaveBeenCalled();
    expect(surfaces).toHaveLength(0);
    expect(target.drawImage).not.toHaveBeenCalled();
  });
  it('does not copy supplied backdrops for either hard or feathered highlight rendering', () => {
    const target = output(),
      a = {} as CanvasImageSource,
      b = {} as CanvasImageSource;
    applyBlurEffect(cast(target), highlight(), rect, { source: a });
    applyBlurEffect(cast(target), highlight(), rect, { source: b });
    applyBlurEffect(cast(target), highlight({ feather: 25, tintOpacity: 40 }), rect, { source: a });
    expect(surfaces[0]!.context.drawImage).not.toHaveBeenCalled();
    expect(surfaces[0]).toMatchObject({ width: 1, height: 1 });
    expect(input().mask).toBe(input(1).mask);
    expect(gpu.render).toHaveBeenCalledTimes(3);
  });
  it('releases source scratch, masks and GPU resources once', () => {
    const target = output();
    applyBlurEffect(cast(target), highlight({ feather: 20 }), rect);
    disposeBlurEffect(cast(target));
    disposeBlurEffect(cast(target));
    expect(gpu.dispose).toHaveBeenCalledOnce();
    expect(surfaces.every((value) => !value.width && !value.height)).toBe(true);
  });
});
