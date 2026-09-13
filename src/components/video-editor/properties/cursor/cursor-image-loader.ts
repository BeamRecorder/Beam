import type { CursorAssetDescriptor, CursorPackDescriptor } from '~/api/types/cursor-pack';
import { cursorAssetSupportsTint } from './cursor-packs';
import { svgAtRasterSize } from './cursor-svg';
import type { CachedCursorImage, CursorImageLoadOptions } from './cursor-image-types';

const imageCache = new Map<string, CachedCursorImage>();
const MAX_CACHED_PIXELS = 4 * 1024 * 1024; // 16 MiB of decoded RGBA artwork.
const MAX_CACHED_ENTRIES = 32;
const trimCache = () => {
  let pixels = [...imageCache.values()].reduce((total, item) => total + item.pixels, 0);
  while (imageCache.size > MAX_CACHED_ENTRIES || pixels > MAX_CACHED_PIXELS) {
    const oldest = imageCache.keys().next().value;
    if (oldest === undefined) break;
    pixels -= imageCache.get(oldest)!.pixels;
    // Consumers own their image too: dropping a cache reference must not blank it.
    imageCache.delete(oldest);
  }
};

const abortError = () => new DOMException('Cursor image loading was cancelled.', 'AbortError');

const decodeImage = (blob: Blob, source: string, signal?: AbortSignal) =>
  new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image();
    const url = URL.createObjectURL(blob);
    const cleanup = () => {
      signal?.removeEventListener('abort', abort);
      URL.revokeObjectURL(url);
    };
    const abort = () => {
      image.onload = null;
      image.onerror = null;
      image.src = '';
      cleanup();
      reject(abortError());
    };
    image.onload = () => {
      cleanup();
      resolve(image);
    };
    image.onerror = () => {
      cleanup();
      reject(new Error(`Unable to decode cursor asset: ${source}`));
    };
    if (signal?.aborted) return abort();
    signal?.addEventListener('abort', abort, { once: true });
    try {
      image.src = url;
    } catch (error) {
      cleanup();
      reject(error);
    }
  });

export async function loadCursorImage(
  pack: CursorPackDescriptor,
  asset: CursorAssetDescriptor,
  rasterWidth: number,
  rasterHeight: number,
  color: string,
  options: CursorImageLoadOptions = {},
): Promise<HTMLImageElement> {
  const tintable = cursorAssetSupportsTint(pack, asset);
  const rasterKey =
    asset.format === 'png'
      ? 'original'
      : `${Math.ceil(rasterWidth)}x${Math.ceil(rasterHeight)}:${tintable ? color : 'original'}`;
  const key = `${pack.id}:${asset.id}:${asset.format ?? 'svg'}:${asset.url}:${rasterKey}`;
  const cached = options.cache === false ? undefined : imageCache.get(key);
  if (cached) {
    imageCache.delete(key);
    imageCache.set(key, cached);
    return cached.loading;
  }
  const loading = (async () => {
    const response = options.signal ? await fetch(asset.url, { signal: options.signal }) : await fetch(asset.url);
    if (!response.ok) throw new Error(`Unable to load cursor asset: ${asset.url} (${response.status})`);
    if (asset.format === 'png') return decodeImage(await response.blob(), asset.url, options.signal);
    return decodeImage(
      new Blob([svgAtRasterSize(await response.text(), rasterWidth, rasterHeight, color, tintable)], {
        type: 'image/svg+xml;charset=utf-8',
      }),
      asset.url,
      options.signal,
    );
  })();
  const entry: CachedCursorImage = { loading, pixels: 0 };
  if (options.cache !== false) {
    imageCache.set(key, entry);
    trimCache();
  }
  try {
    const image = await loading;
    if (imageCache.get(key) === entry) {
      entry.pixels = image.naturalWidth * image.naturalHeight;
      if (entry.pixels > MAX_CACHED_PIXELS) imageCache.delete(key);
      else trimCache();
    }
    return image;
  } catch (error) {
    if (imageCache.get(key) === entry) imageCache.delete(key);
    throw error;
  }
}
