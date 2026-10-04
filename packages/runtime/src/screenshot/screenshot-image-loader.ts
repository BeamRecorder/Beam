import type {
  ScreenshotImageLoader,
  ScreenshotImageLoaderOptions,
  ScreenshotImageRequest,
} from './screenshot-image-loader-types';

/** The caller owns a bounded cache; borrowed decoded images remain valid after eviction or disposal. */
export function createScreenshotImageLoader(options: ScreenshotImageLoaderOptions = {}): ScreenshotImageLoader {
  const maxEntries = options.maxEntries ?? 64;
  const maxPixels = options.maxDecodedPixels ?? 16_777_216;
  if (!Number.isSafeInteger(maxEntries) || maxEntries < 1 || !Number.isFinite(maxPixels) || maxPixels < 1)
    throw new Error('Invalid screenshot image cache limits.');
  const images = new Map<string, ScreenshotImageRequest>();
  const pixels = new Map<string, number>();
  let totalPixels = 0;
  const pending = new Map<string, ScreenshotImageRequest>();
  const request = (url: string): ScreenshotImageRequest => {
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
      if (pending.get(url) !== entry) return image;
      pending.delete(url);
      images.set(url, entry);
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
    const entry = { image, ready: decoded };
    pending.set(url, entry);
    decoded.catch(() => {
      if (pending.get(url) === entry) pending.delete(url);
    });
    return entry;
  };
  return Object.assign((url: string) => request(url).ready, {
    request,
    clear() {
      // Active painters own their pixels; dropping retained references must not blank them.
      images.clear();
      pixels.clear();
      pending.clear();
      totalPixels = 0;
    },
  });
}
