import { beforeEach, it, expect, vi } from 'vitest';
import { createScreenshotCpuPreview } from '../screenshot-cpu-preview';
import { createStillDocument, createDitheringEffect } from '@beam/engine';
import type { Canvas2DContext } from '@beam/runtime/canvas-types';
import type { ScreenshotRenderAssets } from '@beam/runtime/screenshot/screenshot-types';
const rendering = vi.hoisted(() => ({ paint: vi.fn(), cancel: vi.fn(), draw: vi.fn() }));
vi.mock('@beam/runtime/gradient/async-layer-effects', () => ({
  paintWithAsyncLayerEffects: rendering.paint,
  cancelAsyncLayerEffects: rendering.cancel,
}));
vi.mock('@beam/runtime/screenshot/screenshot-render', () => ({ drawScreenshot: rendering.draw }));
beforeEach(() => vi.resetAllMocks());
const setup = () => {
  const state = createStillDocument('x', 'source', 100, 100).state,
    effect = createDitheringEffect('x');
  effect.recipe.algorithm = 'jarvis-judice-ninke';
  state.composition!.find((layer) => layer.id === 'image')!.effects = [effect];
  const ready = vi.fn(),
    error = vi.fn(),
    ctx = {} as Canvas2DContext,
    assets = {} as ScreenshotRenderAssets;
  return { state, ready, error, ctx, assets, preview: createScreenshotCpuPreview({ ready, error }) };
};
const tick = () => new Promise<void>((resolve) => setTimeout(resolve, 0));
it('snapshots worker paints and reports readiness only after the current frame completes', async () => {
  const f = setup();
  let done!: () => void;
  rendering.paint.mockImplementation((_ctx, draw) => {
    draw(f.ctx);
    return new Promise<void>((resolve) => {
      done = resolve;
    });
  });
  expect(f.preview.paint(f.ctx, f.state, f.assets, 100, 100)).toBe(true);
  expect(f.preview.pending.value).toBe(true);
  f.state.canvas.width = 200;
  expect(rendering.draw.mock.calls[0]![1].canvas.width).toBe(100);
  done();
  await tick();
  expect(f.ready).toHaveBeenCalledOnce();
  expect(f.preview.pending.value).toBe(false);
});
it('ignores stale completions and cancels when returning to a GPU-only composition', async () => {
  const f = setup();
  let done!: () => void;
  rendering.paint.mockReturnValue(
    new Promise<void>((resolve) => {
      done = resolve;
    }),
  );
  f.preview.paint(f.ctx, f.state, f.assets, 100, 100);
  f.state.composition!.find((layer) => layer.id === 'image')!.effects = [];
  expect(f.preview.paint(f.ctx, f.state, f.assets, 100, 100)).toBe(false);
  done();
  await tick();
  expect(f.ready).not.toHaveBeenCalled();
  expect(f.preview.pending.value).toBe(false);
  f.preview.dispose();
  expect(rendering.cancel).toHaveBeenCalled();
});
it('reports worker errors and ignores cancellation or disposed completions', async () => {
  const f = setup();
  rendering.paint.mockRejectedValue(new Error('worker failed'));
  f.preview.paint(f.ctx, f.state, f.assets, 100, 100);
  await tick();
  expect(f.error).toHaveBeenCalledOnce();
  expect(f.preview.pending.value).toBe(false);
  rendering.paint.mockRejectedValue(new DOMException('cancelled', 'AbortError'));
  f.preview.paint(f.ctx, f.state, f.assets, 100, 100);
  await tick();
  expect(f.error).toHaveBeenCalledOnce();
  rendering.paint.mockRejectedValue(new Error('late'));
  f.preview.paint(f.ctx, f.state, f.assets, 100, 100);
  f.preview.dispose();
  await tick();
  expect(f.error).toHaveBeenCalledOnce();
});
