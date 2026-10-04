import type { ScreenshotExportRequest, ScreenshotExportAssets, ScreenshotExportImage } from './screenshot-export-types';
import { screenshotExportRasterScale } from './screenshot-export-raster';

/** A job owns its rasters; only two full-resolution decodes may overlap. */
export function createScreenshotExportImages(request: ScreenshotExportRequest) {
  const pending = new Map<string, Promise<ScreenshotExportImage>>();
  const bitmaps = new Set<ImageBitmap>();
  const waiting: Array<() => void> = [];
  let active = 0;
  const decode = async (url: string) => {
    if (active >= 2) await new Promise<void>((resolve) => waiting.push(resolve));
    else active++;
    try {
      const response = await fetch(url);
      if (!response.ok) throw new Error(`Screenshot image unavailable (${response.status}).`);
      const original = await createImageBitmap(await response.blob());
      bitmaps.add(original);
      const { width, height } = original;
      const scale = screenshotExportRasterScale(
        request.state,
        request.source,
        url,
        { width, height },
        request.outputSize,
      );
      let image = original;
      if (scale < 1) {
        image = await createImageBitmap(original, {
          resizeWidth: Math.max(1, Math.ceil(width * scale)),
          resizeHeight: Math.max(1, Math.ceil(height * scale)),
          resizeQuality: 'high',
        });
        bitmaps.add(image);
        original.close();
        bitmaps.delete(original);
      }
      return { image, width, height, rasterSize: { width: image.width, height: image.height } };
    } finally {
      const next = waiting.shift();
      if (next) next();
      else active--;
    }
  };
  const load = (url: string) => {
    let image = pending.get(url);
    if (!image) {
      image = decode(url);
      pending.set(url, image);
    }
    return image;
  };
  const assets = async (): Promise<ScreenshotExportAssets> => {
    const { state, source, decorations } = request;
    const background = state.canvas.showBackground ? state.background : null;
    if (background?.kind === 'video') throw new Error('Screenshot backgrounds must be still images.');
    const [image, backdrop, images] = await Promise.all([
      load(source),
      background?.kind === 'image' ? load(background.path) : null,
      Promise.all(
        (state.images ?? [])
          .filter((layer) => layer.enabled)
          .map(async (layer) => [layer.id, await load(layer.source)] as const),
      ),
    ]);
    return { ...image, ...decorations, background: backdrop?.image ?? null, images: new Map(images) };
  };
  const dispose = async () => {
    await Promise.allSettled(pending.values());
    for (const bitmap of bitmaps) bitmap.close();
    bitmaps.clear();
  };
  return { assets, dispose };
}
