import { loadCursorImage } from '../../video-editor/properties/cursor/cursor-image-loader';
import type { ExportRequest } from '../export-types';
import { requiredExportCursorAssets } from './export-cursor-selection';

export { requiredExportCursorAssets } from './export-cursor-selection';

export interface PreparedCursorImage {
  id: string;
  bitmap: ImageBitmap;
}

export async function prepareExportCursorImages(
  request: ExportRequest,
  signal?: AbortSignal,
): Promise<PreparedCursorImage[]> {
  const assets = requiredExportCursorAssets(request);
  if (!assets.length) return [];
  if (typeof OffscreenCanvas === 'undefined') throw new Error('OffscreenCanvas is required for export.');
  const pack = request.snapshot.cursorPack!;
  const prepared: PreparedCursorImage[] = [];
  try {
    for (const asset of assets) {
      if (signal?.aborted) throw new DOMException('Export cancelled.', 'AbortError');
      const scale = request.snapshot.cursorSettings.size / asset.nominalSize;
      const width = Math.max(1, Math.ceil(asset.intrinsicSize.width * scale * 6));
      const height = Math.max(1, Math.ceil(asset.intrinsicSize.height * scale * 6));
      const image = await loadCursorImage(pack, asset, width, height, request.snapshot.cursorSettings.color, {
        cache: false,
        signal,
      });
      if (signal?.aborted) throw new DOMException('Export cancelled.', 'AbortError');
      const canvas = new OffscreenCanvas(width, height);
      const context = canvas.getContext('2d');
      if (!context) throw new Error('OffscreenCanvas 2D context is unavailable for cursor rasterization.');
      context.imageSmoothingEnabled = true;
      context.imageSmoothingQuality = 'high';
      context.drawImage(image, 0, 0, width, height);
      prepared.push({ id: asset.id, bitmap: canvas.transferToImageBitmap() });
    }
    return prepared;
  } catch (error) {
    for (const image of prepared) image.bitmap.close();
    throw error;
  }
}
