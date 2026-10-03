import { describe, expect, it, vi } from 'vitest';
import type { BlurClip } from '@beam/engine/shared/composition-types';
import type { Canvas2DContext } from '@beam/runtime/canvas-types';
import { effectDeviceRect, planGpuEffect } from '@beam/runtime/composition/effects/gpu-effect-plan';
const matrix = { a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 };
const context = (changes = {}, size = { width: 800, height: 450 }) =>
  ({ canvas: size, getTransform: vi.fn(() => ({ ...matrix, ...changes })) }) as unknown as Canvas2DContext;
const effect = (changes: Partial<BlurClip> = {}) =>
  ({
    kind: 'blur',
    mode: 'blur',
    shape: 'rectangle',
    strength: 50,
    feather: 0,
    tintOpacity: 0,
    cornerRadius: 0,
    ...changes,
  }) as BlurClip;
const rect = { x: 100, y: 100, width: 200, height: 100 };

describe('effect physical bounds', () => {
  it('maps translation and nonuniform positive scales', () => {
    expect(effectDeviceRect(context({ a: 2, d: 3, e: 10, f: 20 }), rect)).toEqual({
      x: 210,
      y: 320,
      width: 400,
      height: 300,
    });
  });
  it('bounds all corners under rotation, skew and reflection', () => {
    expect(effectDeviceRect(context({ a: 0, b: 1, c: -1, d: 0 }), rect)).toEqual({
      x: -200,
      y: 100,
      width: 100,
      height: 200,
    });
    expect(effectDeviceRect(context({ a: -1, c: 0.5 }), rect)).toEqual({ x: -250, y: 100, width: 250, height: 100 });
  });
  it('rounds endpoints once and preserves a minimum one-pixel extent', () => {
    expect(effectDeviceRect(context(), { x: 10.49, y: 20.51, width: 0.01, height: 0.01 })).toEqual({
      x: 10,
      y: 21,
      width: 1,
      height: 1,
    });
  });
});
describe('GPU effect planning', () => {
  it('expands convolution/feather halo and maps local target coordinates', () => {
    const plan = planGpuEffect(context(), effect({ feather: 20 }), rect, {})!;
    expect(plan.sigma).toBe(24);
    expect(plan.feather).toBe(4);
    expect(plan.region).toEqual({ x: 14, y: 14, width: 372, height: 272 });
    expect(plan.target).toEqual({ x: 86, y: 86, width: 200, height: 100 });
    expect(plan.maskTarget).toEqual(plan.target);
    expect(plan.matrix).toBeUndefined();
  });
  it('clips the source region but preserves partially outside target geometry', () => {
    const plan = planGpuEffect(context(), effect(), { x: -20, y: -10, width: 80, height: 50 }, {})!;
    expect(plan.region.x).toBe(0);
    expect(plan.region.y).toBe(0);
    expect(plan.target).toEqual({ x: -20, y: -10, width: 80, height: 50 });
    const edge = planGpuEffect(context(), effect(), { x: 780, y: 440, width: 80, height: 50 }, {})!;
    expect(edge.region.x + edge.region.width).toBe(800);
    expect(edge.region.y + edge.region.height).toBe(450);
  });
  it.each(['square', 'circle'] as const)('centers %s before mapping device bounds', (shape) => {
    const plan = planGpuEffect(context(), effect({ mode: 'opaque', shape }), rect, {})!;
    expect(plan.target).toEqual({ x: 2, y: 2, width: 100, height: 100 });
    expect(plan.region).toEqual({ x: 148, y: 98, width: 104, height: 104 });
  });
  it('separates custom mask geometry from rotated sample bounds', () => {
    const plan = planGpuEffect(context(), effect({ mode: 'opaque' }), rect, {
      bounds: { x: 80, y: 80, width: 240, height: 160 },
      maskPath: () => undefined,
    })!;
    expect(plan.target).toEqual({ x: 2, y: 2, width: 240, height: 160 });
    expect(plan.maskTarget).toEqual({ x: 22, y: 22, width: 200, height: 100 });
  });
  it('derives custom mask feather from its actual mask dimensions rather than its larger rotated bounds', () => {
    const plan = planGpuEffect(context(), effect({ feather: 50 }), rect, {
      bounds: { x: 80, y: 80, width: 240, height: 160 },
      maskPath: () => undefined,
    })!;
    expect(plan.feather).toBe(10);
    expect(plan.maskTarget.width).toBe(200);
    expect(plan.maskTarget.height).toBe(100);
  });
  it.each(['pixelated', 'opaque'] as const)('does not request Gaussian source blur for %s', (mode) => {
    const plan = planGpuEffect(context(), effect({ mode, strength: 100, feather: 100 }), rect, {})!;
    expect(plan.sigma).toBe(0);
    expect(plan.feather).toBe(20);
  });
  it('caps feather at 48 physical pixels', () => {
    const plan = planGpuEffect(
      context({}, { width: 4000, height: 4000 }),
      effect({ mode: 'opaque', feather: 100 }),
      { x: 100, y: 100, width: 2000, height: 1000 },
      {},
    )!;
    expect(plan.feather).toBe(48);
  });
  it('retains full-frame highlight output and its original affine geometry matrix', () => {
    const ctx = context({ a: 2, b: 0.5, c: 0, d: 3, e: 10, f: 20 });
    const plan = planGpuEffect(ctx, effect({ mode: 'highlight', feather: 20 }), rect, {})!;
    expect(plan.region).toEqual({ x: 0, y: 0, width: 800, height: 450 });
    expect(plan.maskTarget).toBe(rect);
    expect(plan.matrix).toEqual(ctx.getTransform());
    expect(plan.sigma).toBe(0);
    expect(plan.feather).toBeCloseTo((Math.hypot(2, 0.5) * 100 * 20) / 500);
  });
  it('caps highlight feather by output size and accepts interior-only illumination', () => {
    const plan = planGpuEffect(
      context({}, { width: 320, height: 180 }),
      effect({ mode: 'highlight', strength: 0, tintOpacity: 40, feather: 100 }),
      rect,
      {},
    )!;
    expect(plan.feather).toBe(8);
    expect(plan.region.width).toBe(320);
  });
  it.each([
    { rect: { ...rect, width: 0 } },
    { rect: { ...rect, height: -1 } },
    { rect: { ...rect, x: 10000 } },
    { effect: effect({ strength: 0 }) },
    { effect: effect({ mode: 'highlight', strength: 0, tintOpacity: 0 }) },
    { size: { width: 0, height: 450 } },
    { size: { width: 800, height: 0 } },
  ])('does no work for an empty request %j', (value) => {
    expect(planGpuEffect(context({}, value.size), value.effect ?? effect(), value.rect ?? rect, {})).toBeNull();
  });
  it.each([{ x: NaN }, { y: Infinity }, { width: Infinity }, { height: NaN }])(
    'rejects nonfinite rectangle values %j',
    (changes) => {
      expect(() => planGpuEffect(context(), effect(), { ...rect, ...changes }, {})).toThrow(RangeError);
    },
  );
  it.each([{ strength: NaN }, { strength: Infinity }, { feather: NaN }, { feather: -Infinity }])(
    'rejects nonfinite effect settings %j',
    (changes) => {
      expect(() => planGpuEffect(context(), effect(changes), rect, {})).toThrow(RangeError);
    },
  );
  it.each([
    { strength: -1 },
    { strength: 101 },
    { feather: -1 },
    { feather: 101 },
    { tintOpacity: -1 },
    { tintOpacity: 101 },
    { tintOpacity: NaN },
  ])('rejects invalid effect ranges %j', (changes) => {
    expect(() => planGpuEffect(context(), effect(changes), rect, {})).toThrow(RangeError);
  });
  it.each(['x', 'y', 'width', 'height'] as const)('rejects invalid custom bounds %s', (key) => {
    expect(() => planGpuEffect(context(), effect(), rect, { bounds: { ...rect, [key]: NaN } })).toThrow(RangeError);
  });
  it.each(['a', 'b', 'c', 'd', 'e', 'f'] as const)('rejects invalid affine matrix component %s', (key) => {
    expect(() => planGpuEffect(context({ [key]: Infinity }), effect(), rect, {})).toThrow(RangeError);
  });
});
