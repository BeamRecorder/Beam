import type { Canvas2DContext } from '@beam/runtime/canvas-types';
import type {
  MediaShadowCacheState,
  MediaShadowOptions,
  MediaShadowRasterPlan,
  MediaShadowRect,
} from '@beam/runtime/composition/appearance/media-shadow-cache-types';

const MAX_BYTES = 64 * 1024 * 1024;
const MAX_ENTRIES = 128;
const MAX_PENDING = 256;
const caches = new WeakMap<Canvas2DContext, MediaShadowCacheState>();

export function mediaShadowRasterPlan(
  rect: MediaShadowRect,
  matrix: DOMMatrix,
  bleed: number,
  identity: string,
): MediaShadowRasterPlan | null {
  const { a, b, c, d, e, f } = matrix;
  if (![rect.x, rect.y, rect.width, rect.height, a, b, c, d, e, f, bleed].every(Number.isFinite)) return null;
  if (rect.width <= 0 || rect.height <= 0 || bleed < 0 || a * d - b * c === 0) return null;
  const originX = a * rect.x + c * rect.y + e;
  const originY = b * rect.x + d * rect.y + f;
  const cornersX = [
    originX,
    originX + a * rect.width,
    originX + c * rect.height,
    originX + a * rect.width + c * rect.height,
  ];
  const cornersY = [
    originY,
    originY + b * rect.width,
    originY + d * rect.height,
    originY + b * rect.width + d * rect.height,
  ];
  const x = Math.floor(Math.min(...cornersX) - bleed);
  const y = Math.floor(Math.min(...cornersY) - bleed);
  const width = Math.ceil(Math.max(...cornersX) + bleed) - x;
  const height = Math.ceil(Math.max(...cornersY) + bleed) - y;
  if (
    ![x, y, width, height].every(Number.isFinite) ||
    width <= 0 ||
    height <= 0 ||
    width > 4096 ||
    height > 4096 ||
    width * height * 4 > MAX_BYTES
  )
    return null;
  // Only integer device translation is removed. Fractional phases remain distinct
  // so cached edges do not shimmer or change when a layer is dragged/zoomed.
  const key = JSON.stringify([identity, rect.width, rect.height, a, b, c, d, originX - x, originY - y, width, height]);
  return { key, x, y, width, height, transform: [a, b, c, d, e - x, f - y] };
}

/** Cache repeated geometric media shadows, never video pixels or colored shape paint. */
export function drawCachedMediaShadow(ctx: Canvas2DContext, options: MediaShadowOptions): boolean {
  if (
    ctx.globalAlpha !== 1 ||
    ctx.globalCompositeOperation !== 'source-over' ||
    ctx.filter !== 'none' ||
    !['transparent', 'rgba(0, 0, 0, 0)', '#00000000'].includes(ctx.shadowColor)
  )
    return false;
  const plan = mediaShadowRasterPlan(options.rect, ctx.getTransform(), options.bleed, options.identity);
  if (!plan) return false;
  let cache = caches.get(ctx);
  if (!cache) caches.set(ctx, (cache = { entries: new Map(), pending: new Set(), bytes: 0 }));
  let entry = cache.entries.get(plan.key);
  if (!entry) {
    const bytes = plan.width * plan.height * 4;
    // Admission, not per-frame eviction: oversized scenes must not allocate endlessly.
    if (cache.entries.size === MAX_ENTRIES || cache.bytes + bytes > MAX_BYTES) return false;
    // A changing camera/drag produces unique fractional rasters. Paint those
    // natively; allocating a texture that is never reused only adds GPU work.
    if (!cache.pending.has(plan.key)) {
      if (cache.pending.size === MAX_PENDING) cache.pending.delete(cache.pending.values().next().value!);
      cache.pending.add(plan.key);
      return false;
    }
    const canvas = new OffscreenCanvas(plan.width, plan.height);
    try {
      const target = canvas.getContext('2d');
      if (!target) throw new Error('Raster paint context is unavailable.');
      target.setTransform(...plan.transform);
      target.imageSmoothingEnabled = ctx.imageSmoothingEnabled;
      target.imageSmoothingQuality = ctx.imageSmoothingQuality;
      options.paint(target);
    } catch (error) {
      canvas.width = canvas.height = 0;
      throw error;
    }
    entry = { canvas, bytes };
    cache.entries.set(plan.key, entry);
    cache.pending.delete(plan.key);
    cache.bytes += bytes;
  }
  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(entry.canvas, plan.x, plan.y);
  ctx.restore();
  return true;
}

export function disposeMediaShadowCache(ctx: Canvas2DContext | null): void {
  if (!ctx) return;
  const cache = caches.get(ctx);
  if (!cache) return;
  caches.delete(ctx);
  for (const { canvas } of cache.entries.values()) canvas.width = canvas.height = 0;
}
