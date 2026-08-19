import type { CursorAssetDescriptor, CursorPackDescriptor } from '~/api/types/cursor-pack';
import { cursorAssetSupportsTint } from './cursor-packs';
import { svgAtRasterSize } from './cursor-svg';

const imageCache = new Map<string, Promise<HTMLImageElement>>();

interface CursorImageLoadOptions {
  cache?: boolean;
  signal?: AbortSignal;
}

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
  const key = `${pack.id}:${asset.id}:${asset.format ?? 'svg'}:${asset.url}:${Math.ceil(rasterWidth)}x${Math.ceil(rasterHeight)}:${tintable ? color : 'original'}`;
  const cached = options.cache === false ? undefined : imageCache.get(key);
  if (cached) return cached;
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
  if (options.cache !== false) imageCache.set(key, loading);
  try {
    return await loading;
  } catch (error) {
    if (options.cache !== false) imageCache.delete(key);
    throw error;
  }
}
