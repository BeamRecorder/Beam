import type { CursorPlaybackState } from '../../composables/cursorPlayback';
import type { CanvasRect } from '../../canvas/output-canvas';
import type { VisualClip } from '~/media/shared/composition-types';
import { frameMediaRect } from '../../composition/appearance/frames';
import { resolveScreenRenderGeometry } from '../../composition/camera-layout';
import type { CursorPackDescriptor, CursorSelection } from '../../../../api/types/cursor-pack';
import { cursorGeometry, resolveCursorAsset } from './cursor-packs';

export const cursorAssetAt = (
  pack: CursorPackDescriptor,
  selection: CursorSelection,
  state: CursorPlaybackState | null,
) => resolveCursorAsset(pack, selection, state?.cursorKind);

export const cursorGeometryAtSize = cursorGeometry;

export interface CursorCanvasBounds {
  x: number;
  y: number;
  width: number;
  height: number;
  hotspot: { x: number; y: number };
}

export function cursorCanvasBounds(
  position: { x: number; y: number },
  geometry: ReturnType<typeof cursorGeometryAtSize>,
  camera: { dx: number; dy: number; dw: number; dh: number; focusX: number; focusY: number; scale: number },
  cursorScale = 1,
): CursorCanvasBounds {
  const centerX = camera.dx + camera.dw / 2;
  const centerY = camera.dy + camera.dh / 2;
  const scale = camera.scale * cursorScale;
  const hotspot = {
    x: centerX + camera.scale * (position.x - camera.focusX),
    y: centerY + camera.scale * (position.y - camera.focusY),
  };
  return {
    x: hotspot.x - geometry.hotspot.x * scale,
    y: hotspot.y - geometry.hotspot.y * scale,
    width: geometry.width * scale,
    height: geometry.height * scale,
    hotspot,
  };
}

export function cursorPositionAt(
  state: CursorPlaybackState,
  source: { width: number; height: number },
  viewport: CanvasRect,
  showBackground: boolean,
  screen: VisualClip,
) {
  const geometry = resolveScreenRenderGeometry(
    screen,
    source.width,
    source.height,
    viewport.width,
    viewport.height,
    showBackground,
  );
  const outer = {
    ...geometry.positioned,
    x: viewport.x + geometry.positioned.x,
    y: viewport.y + geometry.positioned.y,
  };
  const content = frameMediaRect(outer, screen.appearance.frame, geometry.source.width, geometry.source.height, {
    showMenu: screen.appearance.frameShowMenu,
    showScrollbars: screen.appearance.frameShowScrollbars,
    chromeScale: screen.appearance.frameChromeScale,
  });
  const localX = Math.max(0, Math.min(1, (state.x * source.width - geometry.source.x) / geometry.source.width));
  const localY = Math.max(0, Math.min(1, (state.y * source.height - geometry.source.y) / geometry.source.height));
  const x = screen.isMirrored ? 1 - localX : localX;
  const y = screen.isMirroredY ? 1 - localY : localY;
  return {
    x: content.x + x * content.width,
    y: content.y + y * content.height,
  };
}
