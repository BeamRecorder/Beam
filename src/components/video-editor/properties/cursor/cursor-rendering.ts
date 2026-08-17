import type { CursorPlaybackState } from '../../composables/cursorPlayback';
import { framedMediaRect, outputPoint, type CanvasRect } from '../../canvas/output-canvas';
import type { ClipAppearance, NormalizedCrop, NormalizedTransform } from '~/media/shared/composition-types';
import { frameContentRect } from '../../composition/appearance/frames';
import type { CursorPackDescriptor, CursorSelection } from '../../../../api/types/cursor-pack';
import { cursorGeometry, resolveCursorAsset } from './cursor-packs';

export const cursorAssetAt = (
  pack: CursorPackDescriptor,
  selection: CursorSelection,
  state: CursorPlaybackState | null,
) => resolveCursorAsset(pack, selection, state?.cursorKind);

export const cursorGeometryAtSize = cursorGeometry;

export function cursorPositionAt(
  state: CursorPlaybackState,
  source: { width: number; height: number },
  viewport: CanvasRect,
  showBackground: boolean,
  transform: NormalizedTransform = { x: 0, y: 0, width: 1, height: 1 },
  mirrored = false,
  mirroredY = false,
  appearance?: Pick<ClipAppearance, 'frame' | 'frameShowMenu' | 'frameShowScrollbars' | 'frameChromeScale'>,
  crop?: NormalizedCrop,
) {
  const hasCrop = Boolean(crop && crop.width > 0 && crop.height > 0);
  const sourceWidth = hasCrop ? source.width * crop!.width : source.width;
  const sourceHeight = hasCrop ? source.height * crop!.height : source.height;
  const sourceX = hasCrop ? (state.x - crop!.x) / crop!.width : state.x;
  const sourceY = hasCrop ? (state.y - crop!.y) / crop!.height : state.y;
  const localX = Math.max(0, Math.min(1, sourceX));
  const localY = Math.max(0, Math.min(1, sourceY));
  const media = showBackground
    ? framedMediaRect(sourceWidth, sourceHeight, viewport.width, viewport.height)
    : { x: 0, y: 0, width: viewport.width, height: viewport.height };
  const point = showBackground
    ? { cx: localX, cy: localY }
    : outputPoint(localX, localY, sourceWidth, sourceHeight, viewport.width, viewport.height, false);
  const outer = {
    x: viewport.x + media.x + transform.x * media.width,
    y: viewport.y + media.y + transform.y * media.height,
    width: media.width * transform.width,
    height: media.height * transform.height,
  };
  const content = frameContentRect(outer, appearance?.frame ?? 'none', {
    showMenu: appearance?.frameShowMenu,
    showScrollbars: appearance?.frameShowScrollbars,
    chromeScale: appearance?.frameChromeScale,
  });
  const x = mirrored ? 1 - point.cx : point.cx;
  const y = mirroredY ? 1 - point.cy : point.cy;
  return {
    x: content.x + x * content.width,
    y: content.y + y * content.height,
  };
}
