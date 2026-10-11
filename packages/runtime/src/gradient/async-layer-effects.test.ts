import { afterEach, beforeEach, it, expect, vi } from 'vitest';
import { paintWithAsyncLayerEffects, drawJarvisEffect, cancelAsyncLayerEffects } from './async-layer-effects';
import { DEFAULT_DITHERING_RECIPE } from '@beam/engine';
import type { Canvas2DContext } from '../canvas-types';
import type { CpuEffectRequest, CpuEffectReply } from './cpu-effect-types';
vi.mock('../composition/render-composited-layer', () => ({ releaseCompositedLayerSurface: vi.fn() }));
const bitmap = () => ({ close: vi.fn() }) as unknown as ImageBitmap;
const workers: FakeWorker[] = [];
class FakeWorker {
  onmessage: ((event: MessageEvent<CpuEffectReply>) => void) | null = null;
  onerror: ((event: ErrorEvent) => void) | null = null;
  postMessage = vi.fn((_request: CpuEffectRequest, _transfer: Transferable[]) => {});
  terminate = vi.fn();
  constructor() {
    workers.push(this);
  }
  reply(data: CpuEffectReply) {
    this.onmessage?.({ data } as MessageEvent<CpuEffectReply>);
  }
}
const context = () => ({
  canvas: { width: 20, height: 10 },
  setTransform: vi.fn(),
  getTransform: () => ({ a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 }),
  save: vi.fn(),
  restore: vi.fn(),
  drawImage: vi.fn(),
  clearRect: vi.fn(),
});
let scratch: ReturnType<typeof context>;
beforeEach(() => {
  workers.length = 0;
  vi.stubGlobal('Worker', FakeWorker);
  vi.stubGlobal(
    'createImageBitmap',
    vi.fn(async () => bitmap()),
  );
  vi.stubGlobal(
    'OffscreenCanvas',
    class {
      width: number;
      height: number;
      constructor(w: number, h: number) {
        this.width = w;
        this.height = h;
      }
      getContext() {
        scratch = context();
        scratch.canvas = this;
        return scratch;
      }
    },
  );
});
afterEach(() => vi.unstubAllGlobals());
const tick = () => new Promise<void>((resolve) => queueMicrotask(resolve));
const draw = (target: Canvas2DContext) => {
  drawJarvisEffect(target.canvas as OffscreenCanvas, DEFAULT_DITHERING_RECIPE);
};
it('waits for exact results and publishes one complete frame, releasing the worker and bitmap', async () => {
  const ctx = context(),
    result = bitmap(),
    pending = paintWithAsyncLayerEffects(ctx as unknown as Canvas2DContext, draw);
  await tick();
  expect(ctx.drawImage).not.toHaveBeenCalled();
  expect(workers[0]!.postMessage).toHaveBeenCalledOnce();
  workers[0]!.reply({ bitmap: result });
  await pending;
  expect(ctx.drawImage).toHaveBeenCalledOnce();
  expect(ctx.restore).toHaveBeenCalledOnce();
  expect(workers[0]!.terminate).toHaveBeenCalledOnce();
  expect(result.close).toHaveBeenCalledOnce();
  expect(scratch.canvas.width).toBe(0);
  cancelAsyncLayerEffects(ctx as unknown as Canvas2DContext);
});
it('reuses a worker across multiple effects, replaying the complete stack in order', async () => {
  const ctx = context(),
    seen: ImageBitmap[] = [];
  const pending = paintWithAsyncLayerEffects(ctx as unknown as Canvas2DContext, (target) => {
    seen.push(drawJarvisEffect(target.canvas as OffscreenCanvas, DEFAULT_DITHERING_RECIPE));
    draw(target);
  });
  await tick();
  const first = bitmap(),
    second = bitmap();
  workers[0]!.reply({ bitmap: first });
  await tick();
  await tick();
  expect(workers).toHaveLength(1);
  expect(workers[0]!.postMessage).toHaveBeenCalledTimes(2);
  workers[0]!.reply({ bitmap: second });
  await pending;
  expect(seen).toEqual([first, first]);
  expect(first.close).toHaveBeenCalledOnce();
  expect(second.close).toHaveBeenCalledOnce();
});
it('cancels superseded frames and closes late worker results', async () => {
  const ctx = context(),
    controller = new AbortController();
  const old = paintWithAsyncLayerEffects(ctx as unknown as Canvas2DContext, draw, controller.signal);
  const oldRejected = expect(old).rejects.toMatchObject({ name: 'AbortError' });
  await tick();
  const worker = workers[0]!;
  const next = paintWithAsyncLayerEffects(ctx as unknown as Canvas2DContext, () => {});
  controller.abort();
  await next;
  await oldRejected;
  const late = bitmap();
  worker.reply({ bitmap: late });
  expect(late.close).toHaveBeenCalledOnce();
  expect(ctx.drawImage).toHaveBeenCalledOnce();
});
it.each(['reply', 'crash', 'upload', 'post', 'constructor'] as const)(
  'reports %s failures without publishing incomplete output',
  async (failure) => {
    const ctx = context();
    if (failure === 'upload')
      vi.stubGlobal(
        'createImageBitmap',
        vi.fn(async () => {
          throw new Error('upload failed');
        }),
      );
    if (failure === 'constructor')
      vi.stubGlobal(
        'Worker',
        class {
          constructor() {
            throw new Error('worker unavailable');
          }
        },
      );
    const pending = paintWithAsyncLayerEffects(ctx as unknown as Canvas2DContext, draw);
    const failed = expect(pending).rejects.toThrow();
    if (failure === 'post')
      workers[0]!.postMessage.mockImplementation(() => {
        throw new Error('post failed');
      });
    await tick();
    if (failure === 'reply') workers[0]!.reply({ error: 'compute failed' });
    if (failure === 'crash') workers[0]!.onerror?.({ message: '' } as ErrorEvent);
    await failed;
    expect(ctx.drawImage).not.toHaveBeenCalled();
  },
);
it('cancels before an upload completes and refuses painting without a surface', async () => {
  const ctx = context(),
    controller = new AbortController(),
    input = bitmap();
  let resolve!: (bitmap: ImageBitmap) => void;
  vi.stubGlobal(
    'createImageBitmap',
    vi.fn(
      () =>
        new Promise<ImageBitmap>((done) => {
          resolve = done;
        }),
    ),
  );
  const pending = paintWithAsyncLayerEffects(ctx as unknown as Canvas2DContext, draw, controller.signal),
    failed = expect(pending).rejects.toMatchObject({ name: 'AbortError' });
  controller.abort();
  resolve(input);
  await failed;
  expect(input.close).toHaveBeenCalledOnce();
  await expect(
    paintWithAsyncLayerEffects(ctx as unknown as Canvas2DContext, () => {}, controller.signal),
  ).rejects.toMatchObject({ name: 'AbortError' });
  vi.stubGlobal(
    'OffscreenCanvas',
    class {
      getContext() {
        return null;
      }
    },
  );
  await expect(paintWithAsyncLayerEffects(ctx as unknown as Canvas2DContext, () => {})).rejects.toThrow('surface');
});
it('restores session state and propagates painter errors', async () => {
  const ctx = context();
  await expect(
    paintWithAsyncLayerEffects(ctx as unknown as Canvas2DContext, () => {
      throw new Error('paint failed');
    }),
  ).rejects.toThrow('paint failed');
  expect(() => drawJarvisEffect({} as OffscreenCanvas, DEFAULT_DITHERING_RECIPE)).toThrow('asynchronous');
});
