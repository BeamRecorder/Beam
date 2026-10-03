import type { ScreenshotImageLoaderOptions } from './screenshot-image-loader-types';

/** A canvas owns its decoded source/background/logo; editing a cursor does not decode them again. */
export function createScreenshotImageLoader(options: ScreenshotImageLoaderOptions = {}) {
  const maxEntries = options.maxEntries ?? 64;
  const maxPixels = options.maxDecodedPixels ?? 16_777_216;
  if (!Number.isSafeInteger(maxEntries) || maxEntries < 1 || !Number.isFinite(maxPixels) || maxPixels < 1)
    throw new Error('Invalid screenshot image cache limits.');
  const images = new Map<string, Promise<HTMLImageElement>>();
  const pixels = new Map<string, number>();
  let totalPixels = 0;
  const pending = new Map<string, Promise<HTMLImageElement>>();
  return (url: string): Promise<HTMLImageElement> => {
    const cached = pending.get(url) ?? images.get(url);
    if (cached) {
      if (images.has(url)) {
        images.delete(url);
        images.set(url, cached);
      }
      return cached;
    }
    const image = new Image();
    image.crossOrigin = 'anonymous';
    image.src = url;
    const decoded = image.decode().then(() => {
      pending.delete(url);
      images.set(url, decoded);
      const size = image.naturalWidth * image.naturalHeight;
      pixels.set(url, size);
      totalPixels += size;
      while (images.size > maxEntries || totalPixels > maxPixels) {
        const oldest = images.keys().next().value!;
        totalPixels -= pixels.get(oldest)!;
        pixels.delete(oldest);
        images.delete(oldest);
      }
      return image;
    });
    pending.set(url, decoded);
    decoded.catch(() => {
      pending.delete(url);
    });
    return decoded;
  };
}
