import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  createGpuShapeScope,
  disposeGpuShapes,
  withOrderedGpuShapes,
} from '@beam/runtime/composition/shape/ordered-gpu-shapes';
import { shape, context } from '@beam/runtime/composition/shape/tests/gpu-shape.fixtures';
import type { GpuSceneCommand } from '@beam/runtime/gpu/gpu-scene-types';
import type { BlurClip } from '@beam/engine/shared/composition-types';
import type { Canvas2DContext } from '@beam/runtime/canvas-types';
const runtime = vi.hoisted(() => ({
  render: vi.fn((_commands: readonly GpuSceneCommand[], _width: number, _height: number) => ({})),
  dispose: vi.fn(),
  construct: vi.fn(),
}));
const effects = vi.hoisted(() => ({
  paint: vi.fn(),
  group: vi.fn((_ctx: Canvas2DContext, draw: () => void) => draw()),
  dispose: vi.fn(),
}));
vi.mock('@beam/runtime/composition/effects/blur-effect', () => ({
  applyBlurEffect: effects.paint,
  withGpuBlurGroup: effects.group,
  disposeBlurEffect: effects.dispose,
}));
vi.mock('@beam/runtime/gpu/gpu-scene-renderer', () => ({
  GpuSceneRenderer: class {
    constructor() {
      runtime.construct();
    }
    render = runtime.render;
    dispose = runtime.dispose;
  },
}));
const viewport = { x: 0, y: 0, width: 1920, height: 1080 };
const blur = (changes: Partial<BlurClip> = {}): BlurClip => ({
  ...shape(),
  kind: 'blur',
  shape: 'rectangle',
  mode: 'blur',
  strength: 10,
  feather: 0,
  cornerRadius: 0,
  color: '#000000',
  tintOpacity: 0,
  ...changes,
});
beforeEach(() => {
  vi.clearAllMocks();
  effects.group.mockImplementation((_ctx, draw) => draw());
});
describe('ordered native and GPU paint', () => {
  it('omits offscreen and genuinely empty paint without invoking native drawing or allocating a GPU', () => {
    const ctx = context(),
      native = vi.fn();
    withOrderedGpuShapes(ctx, (batch) => {
      expect(batch.tryShape(shape({ transform: { x: 2, y: 2, width: 0.1, height: 0.1 } }), viewport, native)).toBe(
        true,
      );
      expect(batch.tryShape(shape({ fillEnabled: false, borderWidth: 0 }), viewport, native)).toBe(true);
    });
    expect(native).not.toHaveBeenCalled();
    expect(runtime.construct).not.toHaveBeenCalled();
    disposeGpuShapes(ctx);
  });
  it('uses native drawing below the measured GPU admission size and respects explicit barriers', () => {
    const ctx = context(),
      draw = vi.fn(),
      clip = shape();
    withOrderedGpuShapes(ctx, (batch) => {
      expect(batch.tryShape(clip, viewport, draw)).toBe(true);
      batch.flush();
      expect(draw).toHaveBeenCalledOnce();
      expect(batch.tryShape({ ...clip, rotation: 1 }, viewport, draw)).toBe(false);
      batch.tryShape(clip, viewport, draw);
    });
    expect(draw).toHaveBeenCalledTimes(2);
    disposeGpuShapes(ctx);
    disposeGpuShapes(null);
  });
  it('amortizes dense shapes, bounds queued commands, reuses the context and disposes GPU allocations', () => {
    const ctx = context(),
      draw = vi.fn(),
      clip = shape();
    runtime.construct.mockClear();
    runtime.render.mockClear();
    runtime.dispose.mockClear();
    const scope = createGpuShapeScope();
    scope.render(ctx, (batch) => {
      for (let i = 0; i < 16836; i++) batch.tryShape(clip, viewport, draw);
    });
    expect(runtime.render).toHaveBeenCalledOnce();
    expect(ctx.getTransform).toHaveBeenCalledOnce();
    expect(runtime.render.mock.calls[0]?.[0]).toHaveLength(65536);
    expect(draw).toHaveBeenCalledTimes(452);
    scope.render(ctx, (batch) => {
      for (let i = 0; i < 1024; i++) batch.tryShape(clip, viewport, draw);
    });
    expect(runtime.construct).toHaveBeenCalledOnce();
    expect(runtime.render).toHaveBeenCalledTimes(2);
    expect(ctx.drawImage).toHaveBeenCalledTimes(2);
    scope.dispose();
    scope.dispose();
    expect(runtime.dispose).toHaveBeenCalledOnce();
  });
  it('clears aborted queues and restores native state after bridge errors', () => {
    const ctx = context(),
      clip = shape(),
      draw = vi.fn();
    expect(() =>
      withOrderedGpuShapes(ctx, (batch) => {
        batch.tryShape(clip, viewport, draw);
        throw new Error('aborted');
      }),
    ).toThrow('aborted');
    withOrderedGpuShapes(ctx, () => {});
    expect(draw).not.toHaveBeenCalled();
    vi.mocked(ctx.drawImage).mockImplementationOnce(() => {
      throw new Error('bridge');
    });
    expect(() =>
      withOrderedGpuShapes(ctx, (batch) => {
        for (let i = 0; i < 1024; i++) batch.tryShape(clip, viewport, draw);
      }),
    ).toThrow('bridge');
    expect(ctx.restore).toHaveBeenCalledOnce();
    disposeGpuShapes(ctx);
  });
  it('flushes shapes before retained effects and effects before later shapes', () => {
    const ctx = context(),
      order: string[] = [];
    effects.paint.mockImplementation((_ctx, clip: BlurClip) => order.push(`effect:${clip.id}`));
    withOrderedGpuShapes(ctx, (batch) => {
      expect(batch.tryShape(shape(), viewport, () => order.push('shape-before'))).toBe(true);
      expect(batch.tryBlur(blur({ id: 'a' }), viewport)).toBe(true);
      expect(order).toEqual(['shape-before']);
      expect(batch.tryBlur(blur({ id: 'b' }), viewport)).toBe(true);
      expect(batch.tryShape(shape(), viewport, () => order.push('shape-after'))).toBe(true);
      expect(order).toEqual(['shape-before', 'effect:a', 'effect:b']);
    });
    expect(order).toEqual(['shape-before', 'effect:a', 'effect:b', 'shape-after']);
    expect(effects.group).toHaveBeenCalledOnce();
    disposeGpuShapes(ctx);
  });
  it('keeps transition barriers between consecutive GPU effect runs', () => {
    const ctx = context(),
      order: string[] = [];
    effects.paint.mockImplementation((_ctx, clip: BlurClip) => order.push(clip.id));
    withOrderedGpuShapes(ctx, (batch) => {
      batch.tryBlur(blur({ id: 'before' }), viewport);
      expect(
        batch.tryBlur(
          blur({ transitions: { entry: { preset: { kind: 'fade' }, durationMs: 100 }, exit: null } }),
          viewport,
        ),
      ).toBe(false);
      batch.flush();
      order.push('transition');
      batch.tryBlur(blur({ id: 'after' }), viewport);
    });
    expect(order).toEqual(['before', 'transition', 'after']);
    expect(effects.group).not.toHaveBeenCalled();
    disposeGpuShapes(ctx);
  });
  it('discards aborted effect queues and releases effect ownership with every context', () => {
    const a = context(),
      b = context(),
      scope = createGpuShapeScope();
    expect(() =>
      scope.render(a, (batch) => {
        batch.tryBlur(blur(), viewport);
        throw new Error('abort effects');
      }),
    ).toThrow('abort effects');
    scope.render(a, () => undefined);
    expect(effects.paint).not.toHaveBeenCalled();
    scope.render(b, (batch) => batch.tryBlur(blur(), viewport));
    expect(effects.paint).toHaveBeenCalledOnce();
    scope.dispose();
    scope.dispose();
    expect(effects.dispose).toHaveBeenCalledTimes(2);
    expect(effects.dispose.mock.calls.map((args) => args[0])).toEqual([a, b]);
  });
});
