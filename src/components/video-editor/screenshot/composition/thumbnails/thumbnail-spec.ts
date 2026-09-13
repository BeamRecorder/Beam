import type { ScreenshotState } from '~/api/types/screenshot';
import type { CursorPackDescriptor } from '~/api/types/cursor-pack';
import { resolvePublicAssetUrl } from '~/utils/public-asset';
import { WATERMARK_LOGO_PATH } from '../../../canvas/watermark-render';
import { screenshotLayers } from '../../screenshot-layers';
import type { ThumbnailSpec } from './thumbnail-types';
import { screenshotImage } from '../../screenshot-images';

export function screenshotThumbnailSpecs(
  state: ScreenshotState,
  source: string,
  packs: CursorPackDescriptor[],
): ThumbnailSpec[] {
  return screenshotLayers(state).map((layer) => {
    const effect = state.effects?.find((item) => item.id === layer.id);
    const shape = state.shapes.find((item) => item.id === layer.id);
    const cursor = state.cursors?.find((item) => item.id === layer.id);
    const image = screenshotImage(state, layer.id);
    const cursorPack = packs.find((pack) => pack.id === cursor?.selection.packId);
    const cursorAsset = cursorPack?.cursors.find((asset) => asset.id === cursor?.selection.cursorId);
    const sourceUrl =
      layer.kind === 'image'
        ? (state.images?.find((image) => image.id === layer.id)?.source ?? source)
        : layer.kind === 'background' && state.background?.kind === 'image'
          ? resolvePublicAssetUrl(state.background.path)
          : layer.kind === 'watermark' && state.canvas.watermark?.showLogo
            ? resolvePublicAssetUrl(WATERMARK_LOGO_PATH)
            : undefined;
    const visual =
      effect ??
      (shape
        ? { ...shape, enabled: true, transform: { ...shape.transform, x: 0, y: 0 } }
        : cursor
          ? { ...cursor, name: '', enabled: true, position: { x: 0, y: 0 }, asset: cursorAsset }
          : image
            ? { ...image, enabled: true, transform: { ...image.transform, x: 0, y: 0 } }
            : layer.kind === 'background'
              ? [state.background, state.blurPercent]
              : { ...state.canvas.watermark, enabled: true });
    return {
      id: layer.id,
      key: JSON.stringify([state.canvas.width, state.canvas.height, sourceUrl, visual]),
      state: {
        ...state,
        image: image ?? state.image,
        images: [],
        effects: effect ? [effect] : [],
        shapes: shape ? [shape] : [],
        cursors: cursor ? [cursor] : [],
        composition: undefined,
      },
      layer,
      sourceUrl,
      cursorPack,
      cursorAsset,
    };
  });
}
