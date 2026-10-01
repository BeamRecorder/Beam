import type { ScreenshotState } from '~/api/types/screenshot';
import { loadScreenshotDecorations } from '../screenshot-render';
import type { ScreenshotExportTransfer } from './screenshot-export-types';

/** Clone each unique decoded image once; repeated layers share the transferred bitmap. */
export async function screenshotExportAssets(state: ScreenshotState): Promise<ScreenshotExportTransfer> {
  const assets = await loadScreenshotDecorations(state);
  const pending = new Map<CanvasImageSource, Promise<ImageBitmap>>();
  const clone = (image: CanvasImageSource) => {
    const cached = pending.get(image);
    if (cached) return cached;
    const bitmap = createImageBitmap(image);
    pending.set(image, bitmap);
    return bitmap;
  };
  try {
    const [logo, cursors] = await Promise.all([
      assets.logo ? clone(assets.logo) : null,
      assets.cursors &&
        Promise.all(
          [...assets.cursors].map(async ([id, asset]) => [id, { ...asset, image: await clone(asset.image) }] as const),
        ),
    ]);
    const transfer = await Promise.all(pending.values());
    return {
      decorations: {
        logo,
        cursors: cursors && new Map(cursors),
      },
      transfer,
    };
  } catch (reason) {
    // Settle all clones before cleanup so a late decode cannot leave an owned bitmap alive.
    const results = await Promise.allSettled(pending.values());
    for (const result of results) if (result.status === 'fulfilled') result.value.close();
    throw reason;
  }
}
