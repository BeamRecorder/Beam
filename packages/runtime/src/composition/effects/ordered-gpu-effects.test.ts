import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { BlurClip } from '@beam/engine/shared/composition-types';
import type { Canvas2DContext } from '@beam/runtime/canvas-types';
import type { EffectRect } from '@beam/runtime/composition/effects/effect-types';
import { OrderedGpuEffects } from '@beam/runtime/composition/effects/ordered-gpu-effects';
const bridge = vi.hoisted(() => ({
  paint: vi.fn(),
  group: vi.fn((_ctx: Canvas2DContext, draw: () => void, _region?: EffectRect) => draw()),
}));
vi.mock('@beam/runtime/composition/effects/blur-effect', () => ({
  applyBlurEffect: bridge.paint,
  withGpuBlurGroup: bridge.group,
}));
const viewport = { x: 0, y: 0, width: 1920, height: 1080 },
  rect = { x: 600, y: 400, width: 100, height: 60 };
const effect = (changes: Partial<BlurClip> = {}) =>
  ({
    kind: 'blur',
    id: 'blur',
    mode: 'blur',
    shape: 'rectangle',
    strength: 10,
    feather: 0,
    tintOpacity: 0,
    ...changes,
  }) as BlurClip;
const context = (changes = {}) =>
  ({
    canvas: { width: 1920, height: 1080 },
    globalAlpha: 1,
    globalCompositeOperation: 'source-over',
    filter: 'none',
    shadowBlur: 0,
    shadowOffsetX: 0,
    shadowOffsetY: 0,
    shadowColor: 'rgba(0, 0, 0, 0)',
    getTransform: vi.fn(() => ({ a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 })),
    ...changes,
  }) as unknown as Canvas2DContext;
beforeEach(() => {
  vi.clearAllMocks();
  bridge.group.mockImplementation((_ctx, draw) => draw());
});

describe('ordered GPU effect queue', () => {
  it('retains multiple ordered effects until one explicit group flush', () => {
    const ctx = context(),
      queue = new OrderedGpuEffects(ctx),
      a = effect({ id: 'a' }),
      b = effect({ id: 'b', mode: 'frosted' });
    expect(queue.tryEffect(a, rect, viewport)).toBe(true);
    expect(queue.tryEffect(b, { ...rect, x: 620 }, viewport)).toBe(true);
    expect(bridge.paint).not.toHaveBeenCalled();
    queue.flush();
    expect(bridge.group).toHaveBeenCalledOnce();
    expect(bridge.group.mock.calls[0]![0]).toBe(ctx);
    expect(bridge.group.mock.calls[0]![2]).toEqual({ x: 583, y: 383, width: 154, height: 94 });
    expect(bridge.paint.mock.calls.map((args) => args[1].id)).toEqual(['a', 'b']);
  });
  it('uses the immediate GPU bridge for a singleton without full-frame group overhead', () => {
    const queue = new OrderedGpuEffects(context()),
      clip = effect();
    queue.tryEffect(clip, rect, viewport);
    queue.flush();
    queue.flush();
    expect(bridge.paint).toHaveBeenCalledOnce();
    expect(bridge.group).not.toHaveBeenCalled();
  });
  it('unites complete disjoint effect footprints rather than copying the full canvas', () => {
    const queue = new OrderedGpuEffects(context());
    expect(queue.tryEffect(effect({ id: 'a' }), rect, viewport)).toBe(true);
    expect(queue.tryEffect(effect({ id: 'b', mode: 'opaque' }), { ...rect, x: 900, y: 600 }, viewport)).toBe(true);
    queue.flush();
    expect(bridge.group.mock.calls[0]![2]).toEqual({ x: 583, y: 383, width: 419, height: 279 });
    expect(bridge.paint.mock.calls.map((args) => args[1].id)).toEqual(['a', 'b']);
  });
  it('unites physical DPR-scaled convolution bounds without scaling sigma twice', () => {
    const queue = new OrderedGpuEffects(
      context({ canvas: { width: 3840, height: 2160 }, getTransform: () => ({ a: 2, b: 0, c: 0, d: 2, e: 0, f: 0 }) }),
    );
    queue.tryEffect(effect(), rect, viewport);
    queue.tryEffect(effect(), { ...rect, x: 620, y: 420 }, viewport);
    queue.flush();
    expect(bridge.group.mock.calls[0]![2]).toEqual({ x: 1183, y: 783, width: 274, height: 194 });
  });
  it('leaves empty and explicitly cleared queues without rendering work', () => {
    const queue = new OrderedGpuEffects(context());
    queue.flush();
    queue.tryEffect(effect(), rect, viewport);
    queue.clear();
    queue.flush();
    expect(bridge.paint).not.toHaveBeenCalled();
    expect(bridge.group).not.toHaveBeenCalled();
  });
  it('flushes 256 queued effects and continues a fresh group in original order', () => {
    const queue = new OrderedGpuEffects(context());
    for (let index = 0; index < 257; index++)
      expect(queue.tryEffect(effect({ id: `${index}` }), rect, viewport)).toBe(true);
    expect(bridge.group).toHaveBeenCalledOnce();
    expect(bridge.paint).toHaveBeenCalledTimes(256);
    expect(bridge.group.mock.calls[0]![2]).toEqual({ x: 583, y: 383, width: 134, height: 94 });
    queue.flush();
    expect(bridge.paint).toHaveBeenCalledTimes(257);
    expect(bridge.paint.mock.calls.at(-1)![1].id).toBe('256');
  });
  it.each([
    { globalAlpha: 0.5 },
    { globalCompositeOperation: 'multiply' },
    { filter: 'blur(2px)' },
    { shadowBlur: 2 },
    { shadowOffsetX: 1 },
    { shadowOffsetY: -1 },
    { shadowColor: '#000000' },
    { shadowColor: 'red' },
    { shadowColor: 'rgba(0, 0, 0, 0.01)' },
  ])('rejects inherited presentation state %j without queuing', (state) => {
    const queue = new OrderedGpuEffects(context(state));
    expect(queue.tryEffect(effect(), rect, viewport)).toBe(false);
    queue.flush();
    expect(bridge.paint).not.toHaveBeenCalled();
  });
  it.each(['rgba(0, 0, 0, 0)', 'transparent'])('admits the transparent inherited shadow color %s', (shadowColor) => {
    const queue = new OrderedGpuEffects(context({ shadowColor }));
    expect(queue.tryEffect(effect(), rect, viewport)).toBe(true);
    queue.flush();
    expect(bridge.paint).toHaveBeenCalledOnce();
  });
  it.each([
    { mode: 'highlight' as const },
    { transitions: { entry: { preset: { kind: 'fade' as const }, durationMs: 100 }, exit: null } },
    { transitions: { entry: null, exit: { preset: { kind: 'fade' as const }, durationMs: 100 } } },
  ])('keeps transition and inverse-mask effects as immediate GPU barriers %j', (settings) => {
    const queue = new OrderedGpuEffects(context());
    expect(queue.tryEffect(effect(settings), rect, viewport)).toBe(false);
    queue.flush();
    expect(bridge.paint).not.toHaveBeenCalled();
  });
  it.each([{ a: 0 }, { a: -1 }, { d: 0 }, { d: -1 }, { b: 0.1 }, { c: -0.1 }])(
    'rejects incompatible affine state %j',
    (changes) => {
      const queue = new OrderedGpuEffects(
        context({ getTransform: () => ({ a: 1, b: 0, c: 0, d: 1, e: 0, f: 0, ...changes }) }),
      );
      expect(queue.tryEffect(effect(), rect, viewport)).toBe(false);
      queue.flush();
      expect(bridge.paint).not.toHaveBeenCalled();
    },
  );
  it.each([
    { ...rect, x: 0 },
    { ...rect, y: 0 },
    { ...rect, x: 1820 },
    { ...rect, y: 1020 },
  ])('keeps complete filter footprints away from inherited rounded-canvas clipping %j', (target) => {
    const queue = new OrderedGpuEffects(context());
    expect(queue.tryEffect(effect(), target, viewport)).toBe(false);
    queue.flush();
    expect(bridge.paint).not.toHaveBeenCalled();
  });
  it('rejects a footprint outside its narrower composition viewport even inside the physical canvas', () => {
    const queue = new OrderedGpuEffects(context());
    expect(queue.tryEffect(effect(), rect, { x: 700, y: 300, width: 800, height: 500 })).toBe(false);
    queue.flush();
    expect(bridge.paint).not.toHaveBeenCalled();
  });
  it('uses physical transformed viewport and canvas limits for admission', () => {
    const ctx = context({
      canvas: { width: 3840, height: 2160 },
      getTransform: () => ({ a: 2, b: 0, c: 0, d: 2, e: 0, f: 0 }),
    });
    const queue = new OrderedGpuEffects(ctx);
    expect(queue.tryEffect(effect(), rect, viewport)).toBe(true);
    queue.flush();
    expect(bridge.paint).toHaveBeenCalledOnce();
  });
  it('does not retain invisible or zero-strength requests', () => {
    const queue = new OrderedGpuEffects(context());
    expect(queue.tryEffect(effect({ strength: 0 }), rect, viewport)).toBe(false);
    expect(queue.tryEffect(effect(), { ...rect, width: 0 }, viewport)).toBe(false);
    queue.flush();
    expect(bridge.paint).not.toHaveBeenCalled();
  });
  it('detaches pending effects before a failed flush so they cannot be replayed', () => {
    const queue = new OrderedGpuEffects(context());
    queue.tryEffect(effect(), rect, viewport);
    bridge.paint.mockImplementationOnce(() => {
      throw new Error('GPU failed');
    });
    expect(() => queue.flush()).toThrow('GPU failed');
    queue.flush();
    expect(bridge.paint).toHaveBeenCalledOnce();
    queue.tryEffect(effect(), rect, viewport);
    queue.tryEffect(effect(), rect, viewport);
    bridge.group.mockImplementationOnce(() => {
      throw new Error('group failed');
    });
    expect(() => queue.flush()).toThrow('group failed');
    queue.flush();
    expect(bridge.group).toHaveBeenCalledOnce();
  });
});
