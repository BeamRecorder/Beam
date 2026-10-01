import { drawScreenshotLayer } from './screenshot-layer-render';
import { screenshotLayers } from './screenshot-layers';
import { renderCompositedLayer } from '../composition/render-composited-layer';
import type { ScreenshotState } from '~/api/types/screenshot';
import type { Canvas2DContext } from '~/types/canvas';
import type { ScreenshotRenderAssets } from './screenshot-types';

export function drawScreenshot(
  ctx: Canvas2DContext,
  state: ScreenshotState,
  assets: ScreenshotRenderAssets,
  width: number,
  height: number,
  editingId?: string,
) {
  ctx.clearRect(0, 0, width, height);
  for (const layer of screenshotLayers(state)) {
    if (!layer.visible) continue;
    renderCompositedLayer(ctx, layer, width, height, (target, backdrop) => {
      drawScreenshotLayer(target, state, layer, assets, width, height, backdrop, editingId);
    });
  }
}
