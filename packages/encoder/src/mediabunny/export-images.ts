import { mayBeEnabled } from '@beam/engine/scene/scene-visibility';
import type { VisualClip } from '@beam/engine/shared/composition-types';
import type { RenderableMedia } from '@beam/runtime/rendering/render';
import type { ExportRequest } from '../export-types';
import { loadBitmap } from './export-worker-assets';
import { WATERMARK_LOGO_KEY, WATERMARK_LOGO_PATH } from '@beam/runtime/rendering/watermark-render';

export async function loadExportImages(request: ExportRequest, owned: Map<string, ImageBitmap>) {
  const images = new Map<string, RenderableMedia>();
  const watermark = request.snapshot.canvas.watermark;
  if (watermark?.enabled && watermark.showLogo) {
    const path = WATERMARK_LOGO_PATH.replace(/^\//, '');
    const source = import.meta.env.DEV
      ? new URL(`/${path}`, self.location.href).href
      : new URL(`../${path}`, self.location.href).href;
    if (!owned.has(source)) owned.set(source, await loadBitmap(source, 'Beam watermark logo'));
    const bitmap = owned.get(source)!;
    images.set(WATERMARK_LOGO_KEY, { source: bitmap, width: bitmap.width, height: bitmap.height });
  }
  const activeImageIds = new Set(
    request.snapshot.composition.clips
      .filter(
        (clip): clip is VisualClip =>
          clip.kind === 'image' && mayBeEnabled(request.snapshot.composition, clip) && clip.timelineDurationMs > 0,
      )
      .map((clip) => clip.assetId),
  );
  const assets = request.snapshot.composition.assets.filter(
    (asset) => asset.kind === 'image' && activeImageIds.has(asset.id),
  );
  const assetsBySource = new Map(
    assets
      .filter((asset) => !request.frameSources?.some((source) => source.assetId === asset.id))
      .map((asset) => [asset.src, asset]),
  );
  await Promise.all(
    [...assetsBySource].map(async ([source, asset]) => {
      if (request.frameSources?.some((provider) => provider.assetId === asset.id)) return;
      if (owned.has(source)) return;
      owned.set(source, await loadBitmap(source, `image asset "${asset.name}"`));
    }),
  );
  for (const asset of assets) {
    if (request.frameSources?.some((provider) => provider.assetId === asset.id)) continue;
    const bitmap = owned.get(asset.src)!;
    images.set(asset.id, { source: bitmap, width: bitmap.width, height: bitmap.height });
  }
  const background = request.snapshot.background;
  if (background?.kind === 'image') {
    if (!owned.has(background.src)) owned.set(background.src, await loadBitmap(background.src, 'background image'));
    const bitmap = owned.get(background.src)!;
    images.set('export-background', { source: bitmap, width: bitmap.width, height: bitmap.height });
  }
  return images;
}
