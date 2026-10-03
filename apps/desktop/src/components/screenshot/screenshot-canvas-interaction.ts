import { screenshotLayers } from '@beam/engine/screenshot/screenshot-layers';
import { screenshotLayerAt } from './screenshot-layer-geometry';
import type { ScreenshotCanvasInteractionOptions } from './screenshot-canvas-interaction-types';
export function screenshotCanvasInteraction(options: ScreenshotCanvasInteractionOptions) {
  const layerAt = (event: MouseEvent) => {
    const rect = options.canvas()?.getBoundingClientRect();
    if (!rect?.width || !rect.height) return null;
    return screenshotLayerAt(
      options.state(),
      options.assets(),
      (event.clientX - rect.left) / rect.width,
      (event.clientY - rect.top) / rect.height,
    );
  };
  const select = (event: PointerEvent) => {
    if (options.blocked() || event.defaultPrevented || event.button !== 0) return;
    const id = layerAt(event);
    if (event.ctrlKey || event.metaKey || event.shiftKey) options.select(id, 'toggle');
    else options.select(id);
  };
  const editLayer = (event: MouseEvent) => {
    if (options.blocked() || event.button !== 0 || event.ctrlKey || event.metaKey || event.shiftKey) return;
    if (event.target instanceof Element && event.target.closest('button, input, textarea, [role="button"]')) return;
    const id = layerAt(event);
    if (!id) return options.add(event);
    if (options.beginText(id)) return;
    const layer = screenshotLayers(options.state()).find((item) => item.id === id);
    if (layer?.kind !== 'image' || layer.locked) return;
    options.select(id);
    options.crop(id);
  };
  return { layerAt, select, editLayer };
}
