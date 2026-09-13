import type { ThumbnailImageAsset } from './thumbnail-types';

export function createThumbnailImageLoader() {
  const cache = new Map<string, ThumbnailImageAsset>();
  return async (url: string) => {
    const cached = cache.get(url);
    if (cached) {
      cache.delete(url);
      cache.set(url, cached);
      return cached;
    }
    const response = await fetch(url);
    if (!response.ok) throw new Error(`Unable to load thumbnail image (${response.status}).`);
    const source = await createImageBitmap(await response.blob());
    const { width, height } = source;
    let image = source;
    if (Math.max(width, height) > 512) {
      const scale = 512 / Math.max(width, height);
      try {
        image = await createImageBitmap(source, {
          resizeWidth: Math.max(1, Math.round(width * scale)),
          resizeHeight: Math.max(1, Math.round(height * scale)),
          resizeQuality: 'high',
        });
      } finally {
        source.close();
      }
    }
    const asset = { image, width, height };
    cache.set(url, asset);
    if (cache.size > 3) {
      const oldest = cache.keys().next().value!;
      cache.get(oldest)!.image.close();
      cache.delete(oldest);
    }
    return asset;
  };
}
