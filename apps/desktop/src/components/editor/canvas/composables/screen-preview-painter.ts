import type { Canvas2DContext } from '@beam/runtime/canvas-types';
import { drawDecoratedMedia } from '@beam/runtime/composition/appearance/render-decorated-media';
import { drawFrameOverlay } from '@beam/runtime/composition/appearance/frames';
import { createDefaultClipAppearance } from '@beam/engine/shared/composition-defaults';
import type { ScreenPreviewPaint } from './screen-preview-types';
export function drawScreenPreview(
  target: Canvas2DContext,
  paint: ScreenPreviewPaint,
  paintPass?: 'shadow' | 'content',
) {
  const { screen, frame, source, positioned, output, preview, editingPhoneCrop, cropFrame, geometry } = paint;
  if (!screen || !frame) return;
  const { x: dx, y: dy, width: dw, height: dh } = preview;
  drawDecoratedMedia(target, {
    source: frame.bitmap,
    sourceRect: source,
    rect: { x: dx + positioned.x, y: dy + positioned.y, width: positioned.width, height: positioned.height },
    appearance: editingPhoneCrop
      ? { ...screen.appearance, frame: 'none' }
      : (screen.appearance ?? createDefaultClipAppearance('screen', output.showBackground)),
    shadowScale: Math.min(dw / Math.max(1, output.width), dh / Math.max(1, output.height)),
    title: screen.name,
    mirrored: screen.isMirrored,
    mirroredY: screen.isMirroredY,
    rotation: screen.rotation,
    mask: geometry?.mask,
    paintPass,
  });
  if (cropFrame && paintPass !== 'shadow')
    drawFrameOverlay(
      target,
      { x: dx + cropFrame.x, y: dy + cropFrame.y, width: cropFrame.width, height: cropFrame.height },
      screen.appearance.frame,
      screen.name,
      screen.appearance.frameColor,
      {
        showMenu: screen.appearance.frameShowMenu,
        showScrollbars: screen.appearance.frameShowScrollbars,
        chromeScale: screen.appearance.frameChromeScale,
        ...(screen.appearance.frameTheme !== undefined ? { theme: screen.appearance.frameTheme } : {}),
      },
    );
}
