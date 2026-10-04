import { screenshotLayers } from '@beam/engine/screenshot/screenshot-layers';
import { screenshotLayerAt } from './screenshot-layer-geometry';
import type { ScreenshotCanvasInteractionOptions } from './screenshot-canvas-interaction-types';
export function screenshotCanvasInteraction(options: ScreenshotCanvasInteractionOptions) {
  const selectHit = (id: string | null, additive = false) => {
    const individual = id !== null && options.selectedIds().includes(id);
    if (additive) options.select(id, individual ? 'toggle-individual' : 'toggle');
    else if (individual) options.select(id, 'individual');
    else options.select(id);
  };
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
    selectHit(id, event.ctrlKey || event.metaKey || event.shiftKey);
  };
  const editLayer = (event: MouseEvent) => {
    if (event.type === 'click' && event.detail !== 3) return;
    if (options.blocked() || event.button !== 0 || event.ctrlKey || event.metaKey || event.shiftKey) return;
    if (event.target instanceof Element && event.target.closest('button, input, textarea, [role="button"]')) return;
    const id = layerAt(event);
    if (!id) return options.add(event);
    const layer = screenshotLayers(options.state()).find((item) => item.id === id);
    if (!layer || layer.locked) return;
    options.select(id, 'individual');
    if (options.beginElement(id)) return;
    if (layer.kind === 'image') options.crop(id);
  };
  return { layerAt, selectHit, select, editLayer };
}
