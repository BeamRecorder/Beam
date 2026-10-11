import type { Canvas2DContext } from '../canvas-types';
import type { PresetPreviewAssets, PresetPreviewScene } from './preset-preview-types';
import { renderBackground } from '../composition/background/render-background';
import { drawDecoratedMedia } from '../composition/appearance/render-decorated-media';
import { visualMediaOptions } from '../composition/appearance/visual-media-options';
import { drawScreenMedia } from '../rendering/render-screen';
import { drawBeamWatermark } from '../rendering/watermark-render';

/** A still uses the same framing and decoration painters as the editor, at phase zero. */
export function renderPresetPreview(
  context: Canvas2DContext,
  scene: PresetPreviewScene,
  assets: PresetPreviewAssets,
  width: number,
  height: number,
) {
  const scale = Math.min(width / scene.canvas.width, height / scene.canvas.height);
  const canvas = { ...scene.canvas, width, height };
  context.clearRect(0, 0, width, height);
  if (canvas.showBackground)
    renderBackground(context, {
      value: scene.background,
      source: assets.background,
      rect: { x: 0, y: 0, width, height },
      blurPixels: scene.blurPercent * 0.48 * scale,
    });
  if (scene.visual.kind === 'screen') drawScreenMedia(context, scene.visual, assets.image, canvas, 0, scale);
  else
    drawDecoratedMedia(context, {
      ...visualMediaOptions(scene.visual, assets.image, canvas),
      shadowScale: scale,
    });
  drawBeamWatermark(context, canvas, { x: 0, y: 0, width, height }, assets.logo);
}
