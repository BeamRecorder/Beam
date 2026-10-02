import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Canvas2DContext } from '~/types/canvas';
import { disposeMediaShadowCache, drawCachedMediaShadow, mediaShadowRasterPlan } from './media-shadow-cache';
import type { MediaShadowOptions } from './media-shadow-cache-types';

const matrix = (patch: Partial<DOMMatrix> = {}) => ({ a: 1, b: 0, c: 0, d: 1, e: 0, f: 0, ...patch }) as DOMMatrix;
const context = (patch: Partial<Canvas2DContext> = {}) =>
  ({
    globalAlpha: 1,
    globalCompositeOperation: 'source-over',
    filter: 'none',
    shadowColor: 'transparent',
    imageSmoothingEnabled: true,
    imageSmoothingQuality: 'high',
    lineCap: 'round',
    lineJoin: 'round',
    miterLimit: 10,
    lineDashOffset: 0,
    getTransform: vi.fn(() => matrix()),
    getLineDash: vi.fn(() => [2, 4]),
    setLineDash: vi.fn(),
    setTransform: vi.fn(),
    save: vi.fn(),
    restore: vi.fn(),
    drawImage: vi.fn(),
    ...patch,
  }) as unknown as Canvas2DContext;
let surfaces: Canvas[];
class Canvas {
  width: number;
  height: number;
  ctx = context();
  constructor(width: number, height: number) {
    this.width = width;
    this.height = height;
    surfaces.push(this);
  }
  getContext() {
    return this.ctx;
  }
}
const options = (patch: Partial<MediaShadowOptions> = {}) => ({
  rect: { x: 10.25, y: 20.5, width: 100, height: 60 },
  bleed: 20,
  identity: 'paint',
  paint: vi.fn(),
  ...patch,
});
const admit = (ctx: Canvas2DContext, value: MediaShadowOptions) => {
  drawCachedMediaShadow(ctx, value);
  return drawCachedMediaShadow(ctx, value);
};
beforeEach(() => {
  surfaces = [];
  vi.stubGlobal('OffscreenCanvas', Canvas);
});
afterEach(() => vi.unstubAllGlobals());

describe('device-aligned raster planning', () => {
  it('keeps fractional raster phases while sharing integer translation', () => {
    const rect = { x: 10.25, y: 20.5, width: 100, height: 60 };
    const a = mediaShadowRasterPlan(rect, matrix(), 20, 'a')!,
      b = mediaShadowRasterPlan(rect, matrix({ e: 100, f: -20 }), 20, 'a')!;
    expect(a.key).toBe(b.key);
    expect(b.x - a.x).toBe(100);
    expect(b.y - a.y).toBe(-20);
    expect(mediaShadowRasterPlan(rect, matrix({ e: 0.1 }), 20, 'a')!.key).not.toBe(a.key);
    expect(a.transform).toEqual([1, 0, 0, 1, 10, 0]);
  });
  it('bounds every transformed corner including rotation and negative scale', () => {
    const p = mediaShadowRasterPlan(
      { x: 0, y: 0, width: 100, height: 60 },
      matrix({ a: 0, b: 2, c: -1, d: 0, e: 10, f: -10 }),
      5,
      'a',
    )!;
    expect(p).toMatchObject({ x: -55, y: -15, width: 70, height: 210, transform: [0, 2, -1, 0, 65, 5] });
    expect(mediaShadowRasterPlan({ x: 0, y: 0, width: 100, height: 60 }, matrix({ a: -1 }), 0, 'a')!.x).toBe(-100);
  });
  it('rejects invalid, empty, singular, excessive and overflowing geometry', () => {
    const rect = { x: 0, y: 0, width: 100, height: 60 };
    for (const r of [
      { ...rect, width: 0 },
      { ...rect, height: -1 },
      { ...rect, x: NaN },
      { ...rect, width: 8192 },
    ])
      expect(mediaShadowRasterPlan(r, matrix(), 0, 'a')).toBeNull();
    expect(mediaShadowRasterPlan(rect, matrix({ a: 0 }), 0, 'a')).toBeNull();
    expect(mediaShadowRasterPlan(rect, matrix(), -1, 'a')).toBeNull();
    expect(mediaShadowRasterPlan(rect, matrix({ e: Infinity }), 0, 'a')).toBeNull();
    expect(mediaShadowRasterPlan(rect, matrix({ a: Number.MAX_VALUE }), 0, 'a')).toBeNull();
    expect(mediaShadowRasterPlan(rect, matrix(), Infinity, 'a')).toBeNull();
  });
});

describe('immutable raster paints', () => {
  it('paints once and copies at integer device coordinates without resampling', () => {
    const ctx = context(),
      o = options();
    expect(drawCachedMediaShadow(ctx, o)).toBe(false);
    expect(surfaces).toHaveLength(0);
    expect(drawCachedMediaShadow(ctx, o)).toBe(true);
    expect(drawCachedMediaShadow(ctx, o)).toBe(true);
    expect(o.paint).toHaveBeenCalledOnce();
    expect(surfaces).toHaveLength(1);
    expect(surfaces[0]!.ctx.setTransform).toHaveBeenCalledWith(1, 0, 0, 1, 10, 0);
    expect(ctx.drawImage).toHaveBeenCalledWith(surfaces[0], -10, 0);
  });
  it('separates context ownership, appearance and geometry', () => {
    const ctx = context(),
      o = options();
    admit(ctx, o);
    admit(context(), o);
    admit(ctx, options({ identity: 'changed' }));
    admit(ctx, options({ bleed: 30 }));
    expect(surfaces).toHaveLength(4);
  });
  it('declines paints whose opacity, blending, filter or inherited shadow cannot be isolated exactly', () => {
    for (const patch of [
      { globalAlpha: 0.5 },
      { globalCompositeOperation: 'multiply' as const },
      { filter: 'blur(4px)' },
      { shadowColor: '#000000' },
    ])
      expect(drawCachedMediaShadow(context(patch), options())).toBe(false);
    expect(drawCachedMediaShadow(context(), options({ rect: { x: 0, y: 0, width: 0, height: 10 } }))).toBe(false);
    expect(surfaces).toHaveLength(0);
  });
  it('stops admission at the entry limit while retaining already useful textures', () => {
    const ctx = context();
    for (let i = 0; i < 128; i++) expect(admit(ctx, options({ identity: String(i) }))).toBe(true);
    expect(drawCachedMediaShadow(ctx, options({ identity: 'full' }))).toBe(false);
    expect(drawCachedMediaShadow(ctx, options({ identity: '0' }))).toBe(true);
    expect(surfaces).toHaveLength(128);
  });
  it('enforces the byte budget before allocating an additional GPU texture', () => {
    const ctx = context(),
      o = options({ rect: { x: 0, y: 0, width: 4096, height: 2048 }, bleed: 0 });
    expect(admit(ctx, o)).toBe(true);
    expect(admit(ctx, { ...o, identity: 'second' })).toBe(true);
    expect(drawCachedMediaShadow(ctx, options())).toBe(false);
    expect(surfaces).toHaveLength(2);
  });
  it('releases failed paints and retries instead of retaining partial content', () => {
    const ctx = context(),
      o = options({
        paint: () => {
          throw new Error('paint');
        },
      });
    expect(() => admit(ctx, o)).toThrow('paint');
    expect(surfaces[0]!.width).toBe(0);
    expect(drawCachedMediaShadow(ctx, options())).toBe(true);
    expect(surfaces).toHaveLength(2);
  });
  it('reports context creation failure and frees the allocated surface', () => {
    const ctx = context();
    vi.spyOn(Canvas.prototype, 'getContext').mockReturnValueOnce(null as unknown as Canvas2DContext);
    expect(() => admit(ctx, options())).toThrow('context is unavailable');
    expect(surfaces[0]!.height).toBe(0);
  });
  it('never allocates GPU textures for continuously changing geometry', () => {
    const ctx = context();
    for (let i = 0; i < 1000; i++) expect(drawCachedMediaShadow(ctx, options({ identity: String(i) }))).toBe(false);
    expect(surfaces).toHaveLength(0);
    // The old candidate aged out of the bounded pending set.
    expect(drawCachedMediaShadow(ctx, options({ identity: '0' }))).toBe(false);
    expect(drawCachedMediaShadow(ctx, options({ identity: '0' }))).toBe(true);
    expect(surfaces).toHaveLength(1);
  });
  it('admits a recurring candidate and removes it from pending ownership', () => {
    const ctx = context(),
      o = options();
    expect(admit(ctx, o)).toBe(true);
    for (let i = 0; i < 300; i++) drawCachedMediaShadow(ctx, options({ identity: String(i) }));
    expect(drawCachedMediaShadow(ctx, o)).toBe(true);
    expect(surfaces).toHaveLength(1);
  });
  it('clears pending geometry with its output renderer', () => {
    const ctx = context(),
      o = options();
    drawCachedMediaShadow(ctx, o);
    disposeMediaShadowCache(ctx);
    expect(drawCachedMediaShadow(ctx, o)).toBe(false);
    expect(surfaces).toHaveLength(0);
  });
});

describe('raster paint disposal', () => {
  it('accepts absent and unused contexts', () => {
    disposeMediaShadowCache(null);
    disposeMediaShadowCache(context());
    expect(surfaces).toHaveLength(0);
  });
  it('releases every retained GPU texture once', () => {
    const ctx = context();
    admit(ctx, options());
    admit(ctx, options({ identity: 'b' }));
    disposeMediaShadowCache(ctx);
    disposeMediaShadowCache(ctx);
    expect(surfaces.every((s) => s.width === 0 && s.height === 0)).toBe(true);
  });
  it('allows fresh rendering after an output context is explicitly cleared', () => {
    const ctx = context(),
      o = options();
    admit(ctx, o);
    disposeMediaShadowCache(ctx);
    admit(ctx, o);
    expect(o.paint).toHaveBeenCalledTimes(2);
    expect(surfaces[1]!.width).toBeGreaterThan(0);
  });
});
