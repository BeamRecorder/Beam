import { getCaptionTransform } from '@beam/engine/shared/composition-types';
import { layoutCaptionText } from '@beam/engine/shared/caption-text-layout';
import type { Canvas2DContext } from '../../canvas-types';
import type { CaptionTextCache, CaptionTextCacheState } from './caption-text-cache-types';

const caches = new WeakMap<Canvas2DContext, CaptionTextCacheState>();
const MAX_KEY_LENGTH = 4096;
const measurementKey = (ctx: Canvas2DContext) => [
  ctx.font,
  ctx.letterSpacing,
  ctx.wordSpacing,
  ctx.fontKerning,
  ctx.fontStretch,
  ctx.fontVariantCaps,
  ctx.direction,
  ctx.textRendering,
];

function retain<T>(cache: Map<string, T>, key: string, limit: number, enabled: boolean, compute: () => T): T {
  if (!enabled || key.length > MAX_KEY_LENGTH) return compute();
  const cached = cache.get(key);
  if (cached !== undefined) return cached;
  const value = compute();
  if (cache.size >= limit) cache.delete(cache.keys().next().value!);
  cache.set(key, value);
  return value;
}

/** CPU metadata only: no text raster cache, and no retained measurements while fonts are loading. */
export function captionTextCache(ctx: Canvas2DContext): CaptionTextCache {
  let cache = caches.get(ctx);
  if (!cache) {
    const created: CaptionTextCacheState = {
      fontSet: undefined,
      faces: [],
      enabled: true,
      measures: new Map(),
      layouts: new Map(),
      measure(text) {
        const key = JSON.stringify([...measurementKey(ctx), text]);
        return retain(created.measures, key, 512, created.enabled, () => ctx.measureText(text).width);
      },
      layout(options) {
        const style = options.clip.caption.style;
        const transform = options.transform ?? getCaptionTransform(options.clip);
        const key = JSON.stringify([
          ...measurementKey(ctx),
          options.text,
          options.canvasWidth,
          options.canvasHeight,
          style.fontSize,
          style.lineHeight,
          style.wrap,
          transform.x,
          transform.y,
          transform.width,
          transform.height,
        ]);
        return retain(created.layouts, key, 128, created.enabled, () => {
          const layout = layoutCaptionText({ ...options, transform, measureText: created.measure });
          // Mutable host drafts must not rewrite previously retained geometry.
          return { ...layout, transform: { ...layout.transform } };
        });
      },
    };
    caches.set(ctx, created);
    cache = created;
  }
  const fonts =
    typeof document !== 'undefined'
      ? document.fonts
      : (globalThis as typeof globalThis & { fonts?: FontFaceSet }).fonts;
  let changed = cache.fontSet !== fonts || cache.faces.length !== (fonts?.size ?? 0);
  let index = 0;
  for (const face of fonts ?? []) {
    const previous = cache.faces[index++];
    if (previous?.[0] !== face || previous[1] !== face.status) changed = true;
  }
  cache.enabled = !fonts || fonts.status === 'loaded';
  if (changed || !cache.enabled) {
    cache.fontSet = fonts;
    cache.faces = Array.from(fonts ?? [], (face) => [face, face.status] as const);
    cache.measures.clear();
    cache.layouts.clear();
  }
  return cache;
}
