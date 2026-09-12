import type { ScreenshotState } from '~/api/types/screenshot';
import type { Canvas2DContext } from '~/types/canvas';
import { renderCompositedLayer } from '../composition/render-composited-layer';
import { drawScreenshotLayer } from './screenshot-layer-render';
import { screenshotLayers } from './screenshot-layers';
import type { ScreenshotRenderAssets } from './screenshot-types';

/** Reuse the unchanged backdrop for one pointer gesture, including its blur and shadows.
 * Layers above the moving element still sample the current backdrop for blending and glass effects.
 */
export function createScreenshotDragRenderer() {
  let surface: OffscreenCanvas | null = null;
  let cachedAssets: ScreenshotRenderAssets | null = null;
  let cachedId: string | null = null;
  let cachedEditingId: string | undefined;
  const reset = () => {
    surface = null;
    cachedAssets = null;
    cachedId = null;
  };
  const draw = (
    ctx: Canvas2DContext,
    state: ScreenshotState,
    assets: ScreenshotRenderAssets,
    width: number,
    height: number,
    selectedId: string,
    editingId?: string,
  ) => {
    const layers = screenshotLayers(state);
    const index = Math.max(
      0,
      layers.findIndex((layer) => layer.id === selectedId),
    );
    const paint = (target: Canvas2DContext, start: number, end: number) => {
      for (let i = start; i < end; i++) {
        const layer = layers[i]!;
        if (!layer.visible) continue;
        renderCompositedLayer(target, layer, width, height, (context, backdrop) =>
          drawScreenshotLayer(context, state, layer, assets, width, height, backdrop, editingId),
        );
      }
    };
    if (
      !surface ||
      surface.width !== width ||
      surface.height !== height ||
      cachedAssets !== assets ||
      cachedId !== selectedId ||
      cachedEditingId !== editingId
    ) {
      const next = new OffscreenCanvas(width, height);
      const context = next.getContext('2d');
      if (!context) throw new Error('Screenshot rendering unavailable.');
      paint(context, 0, index);
      surface = next;
      cachedAssets = assets;
      cachedId = selectedId;
      cachedEditingId = editingId;
    }
    ctx.clearRect(0, 0, width, height);
    ctx.drawImage(surface, 0, 0);
    paint(ctx, index, layers.length);
  };
  return { draw, reset };
}
