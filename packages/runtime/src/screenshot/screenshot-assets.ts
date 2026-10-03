import type { ScreenshotState } from '@beam/engine/screenshot/screenshot-types';
import type { ScreenshotAssetServices } from './screenshot-host-types';
import type { ScreenshotRenderAssets } from './screenshot-types';
import { loadScreenshotCursors } from './screenshot-cursors';
import { loadElementFonts } from '../shared/element-font-loader';

export async function prepareScreenshotAssets(
  source: string,
  state: ScreenshotState,
  host: ScreenshotAssetServices,
): Promise<ScreenshotRenderAssets> {
  const background = state.canvas.showBackground ? state.background : null;
  if (background?.kind === 'video') throw new Error('A still image cannot use an animated background.');
  const [image, backdrop, logo, cursors, images] = await Promise.all([
    host.loadImage(source),
    background?.kind === 'image' ? host.loadImage(background.path) : null,
    state.canvas.watermark?.enabled && state.canvas.watermark.showLogo ? host.loadImage(host.watermarkSource) : null,
    state.cursors?.some((cursor) => cursor.enabled)
      ? loadScreenshotCursors(state.cursors, host.cursorPacks, state.canvas)
      : undefined,
    Promise.all(
      (state.images ?? []).map(async (layer) => {
        const image = await host.loadImage(layer.source);
        return [layer.id, { image, width: image.naturalWidth, height: image.naturalHeight }] as const;
      }),
    ),
    loadElementFonts(state.shapes, host.fontSource),
  ]);
  return {
    image,
    background: backdrop,
    logo,
    width: image.naturalWidth,
    height: image.naturalHeight,
    ...(cursors ? { cursors } : {}),
    ...(images.length ? { images: new Map(images) } : {}),
  };
}
