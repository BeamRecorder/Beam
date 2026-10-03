import type { ImmutableMediaCache } from '@beam/runtime/composition/appearance/immutable-media-cache-types';

export const IMMUTABLE_MEDIA_CACHE_VARIANTS = 32;

export function isImmutableMedia(source: CanvasImageSource): boolean {
  return (
    (typeof ImageBitmap !== 'undefined' && source instanceof ImageBitmap) ||
    (typeof VideoFrame !== 'undefined' && source instanceof VideoFrame)
  );
}

/** Weak keys borrow decoder-owned frames; mutable canvases/videos are never retained. */
export function createImmutableMediaCache<Value>(): ImmutableMediaCache<Value> {
  const sources = new WeakMap<CanvasImageSource, Map<string, Value>>();
  return {
    get: (source, key) => sources.get(source)?.get(key),
    set: (source, key, value) => {
      if (!isImmutableMedia(source)) return;
      let variants = sources.get(source);
      if (!variants) sources.set(source, (variants = new Map()));
      if (!variants.has(key) && variants.size === IMMUTABLE_MEDIA_CACHE_VARIANTS)
        variants.delete(variants.keys().next().value!);
      variants.set(key, value);
    },
  };
}
