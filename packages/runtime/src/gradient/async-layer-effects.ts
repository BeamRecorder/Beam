import type { Canvas2DContext } from '../canvas-types';
import type { DitheringRecipe } from '@beam/engine/gradient/dithering-effect-types';
import type { CpuEffectSession, CpuEffectWorker } from './cpu-effect-types';
import { releaseCompositedLayerSurface } from '../composition/render-composited-layer';

class PendingEffect {
  readonly ready: Promise<void>;
  constructor(ready: Promise<void>) {
    this.ready = ready;
  }
}
let activeSession: CpuEffectSession | undefined;
const sessions = new WeakMap<Canvas2DContext, CpuEffectSession>();
const aborted = () => new DOMException('Effect rendering superseded.', 'AbortError');

export function cancelAsyncLayerEffects(ctx: Canvas2DContext) {
  const session = sessions.get(ctx);
  if (!session) return;
  session.cancelled = true;
  session.reject?.(aborted());
  session.worker?.terminate();
  session.worker = undefined;
  sessions.delete(ctx);
}

/** Resolve only CPU effects; each retry replays the unchanged document in its original stack order. */
export function drawJarvisEffect(source: OffscreenCanvas, recipe: DitheringRecipe, pixelRatio = 1): ImageBitmap {
  const session = activeSession;
  if (!session) throw new Error('JJN requires asynchronous layer-effect painting.');
  const index = session.cursor++;
  const result = session.results[index];
  if (result) return result;
  const ready = new Promise<void>((resolve, reject) => {
    session.reject = reject;
    const worker = (session.worker ??= new Worker(new URL('./dithering.worker.ts', import.meta.url), {
      type: 'module',
    }) as CpuEffectWorker);
    worker.onmessage = ({ data }) => {
      session.reject = undefined;
      if (session.cancelled) {
        data.bitmap?.close();
        return;
      }
      if (data.error !== undefined) reject(new Error(data.error));
      else {
        session.results[index] = data.bitmap;
        resolve();
      }
    };
    worker.onerror = (event) => reject(new Error(event.message || 'JJN worker failed.'));
    void createImageBitmap(source).then((bitmap) => {
      if (session.cancelled) {
        bitmap.close();
        reject(aborted());
        return;
      }
      try {
        worker.postMessage({ source: bitmap, recipe, pixelRatio }, [bitmap]);
      } catch (error) {
        bitmap.close();
        reject(error);
      }
    }, reject);
  });
  throw new PendingEffect(ready);
}

/** Paint into a private surface, publishing a complete frame only after all worker jobs finish. */
export async function paintWithAsyncLayerEffects(
  ctx: Canvas2DContext,
  draw: (target: Canvas2DContext) => void,
  signal?: AbortSignal,
) {
  cancelAsyncLayerEffects(ctx);
  const session: CpuEffectSession = { cursor: 0, results: [], cancelled: false };
  sessions.set(ctx, session);
  const canvas = new OffscreenCanvas(ctx.canvas.width, ctx.canvas.height),
    target = canvas.getContext('2d');
  if (!target) {
    sessions.delete(ctx);
    throw new Error('Async effect surface unavailable.');
  }
  target.setTransform(ctx.getTransform());
  const cancel = () => {
    if (sessions.get(ctx) === session) cancelAsyncLayerEffects(ctx);
  };
  signal?.addEventListener('abort', cancel, { once: true });
  try {
    for (;;) {
      if (signal?.aborted || session.cancelled) throw aborted();
      session.cursor = 0;
      let pending: PendingEffect | undefined;
      const previous = activeSession;
      try {
        activeSession = session;
        target.save();
        try {
          target.setTransform(1, 0, 0, 1, 0, 0);
          target.clearRect(0, 0, canvas.width, canvas.height);
        } finally {
          target.restore();
        }
        target.save();
        try {
          draw(target);
        } finally {
          target.restore();
        }
      } catch (error) {
        if (error instanceof PendingEffect) pending = error;
        else throw error;
      } finally {
        activeSession = previous;
      }
      if (!pending) break;
      await pending.ready;
    }
    if (session.cancelled) throw aborted();
    ctx.save();
    try {
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);
      ctx.drawImage(canvas, 0, 0);
    } finally {
      ctx.restore();
    }
  } finally {
    signal?.removeEventListener('abort', cancel);
    session.worker?.terminate();
    for (const bitmap of session.results) bitmap.close();
    releaseCompositedLayerSurface(target);
    canvas.width = canvas.height = 0;
    if (sessions.get(ctx) === session) sessions.delete(ctx);
  }
}
