import { drawScreenshotLayer } from './screenshot-layer-render';
import { screenshotLayers } from '@beam/engine/screenshot/screenshot-layers';
import { releaseCompositedLayerSurface, renderCompositedLayer } from '../composition/render-composited-layer';
import type { Canvas2DContext } from '../canvas-types';
import type { ScreenshotState } from '@beam/engine/screenshot/screenshot-types';
import type { ScreenshotRenderAssets, ScreenshotLayerPaintObserver } from '@beam/runtime/screenshot/screenshot-types';

export function drawScreenshot(
  ctx: Canvas2DContext,
  state: ScreenshotState,
  assets: ScreenshotRenderAssets,
  width: number,
  height: number,
  editingId?: string,
  onLayerPaint?: ScreenshotLayerPaintObserver,
  beforeLayer?: string,
  sharpLenses = true,
) {
  ctx.clearRect(0, 0, width, height);
  for (const layer of screenshotLayers(state)) {
    if (layer.id === beforeLayer) break;
    if (!layer.visible) continue;
    const started = onLayerPaint ? performance.now() : 0;
    try {
      renderCompositedLayer(ctx, layer, width, height, (target, backdrop) => {
        drawScreenshotLayer(
          target,
          state,
          layer,
          assets,
          width,
          height,
          backdrop,
          editingId,
          sharpLenses && layer.kind === 'zoom'
            ? {
                draw: (scene, w, h) =>
                  drawScreenshot(scene, state, assets, w, h, editingId, undefined, layer.id, false),
                dispose: releaseCompositedLayerSurface,
              }
            : undefined,
        );
      });
    } finally {
      if (onLayerPaint) onLayerPaint(layer, performance.now() - started);
    }
  }
}
