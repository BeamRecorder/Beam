import { createAlignmentIndex } from '@beam/engine/layout/alignment-index';
import { screenshotLayers } from '@beam/engine/screenshot/screenshot-layers';
import { screenshotImage } from '@beam/engine/screenshot/screenshot-images';
import type { ScreenshotState } from '@beam/engine/screenshot/screenshot-types';
import type { ScreenshotRenderAssets } from '@beam/runtime/screenshot/screenshot-types';
import type { ScreenshotTranslation } from './screenshot-types';
import { screenshotLayerBounds, screenshotLayerTransform } from './screenshot-layer-geometry';
/** All document geometry is frozen at pointer-down; no state cloning during pointer moves. */
export function createScreenshotAlignment(
  state: ScreenshotState,
  assets: ScreenshotRenderAssets | null,
  ids: readonly string[],
  viewport: { width: number; height: number },
) {
  const selected = new Set(ids),
    targets = [],
    moved = [],
    originals = [];
  for (const layer of screenshotLayers(state)) {
    if (!layer.visible || layer.opacity === 0 || ['background', 'watermark'].includes(layer.kind)) continue;
    const rect = screenshotLayerBounds(state, assets, layer.id);
    if (!rect) continue;
    if (selected.has(layer.id) && !layer.locked) {
      moved.push(rect);
      originals.push(screenshotImage(state, layer.id)?.transform ?? screenshotLayerTransform(state, assets, layer.id)!);
    } else if (!selected.has(layer.id)) targets.push(rect);
  }
  if (!moved.length) return () => ({ translation: { x: 0, y: 0 }, guides: [], measurements: [] });
  const left = Math.min(...moved.map((r) => r.x)),
    top = Math.min(...moved.map((r) => r.y));
  const rect = {
    x: left,
    y: top,
    width: Math.max(...moved.map((r) => r.x + r.width)) - left,
    height: Math.max(...moved.map((r) => r.y + r.height)) - top,
  };
  const limits = {
    minX: Math.max(...originals.map((r) => -r.width + 0.01 - r.x)),
    maxX: Math.min(...originals.map((r) => 0.99 - r.x)),
    minY: Math.max(...originals.map((r) => -r.height + 0.01 - r.y)),
    maxY: Math.min(...originals.map((r) => 0.99 - r.y)),
  };
  const clamp = (delta: ScreenshotTranslation) => ({
    x: Math.max(limits.minX, Math.min(limits.maxX, delta.x)),
    y: Math.max(limits.minY, Math.min(limits.maxY, delta.y)),
  });
  const query = createAlignmentIndex({ targets, canvas: state.canvas });
  return (delta: ScreenshotTranslation, bypass = false) => {
    const translation = clamp(delta);
    const snapped = query(
      { ...rect, x: left + translation.x, y: top + translation.y },
      { x: bypass ? 0 : 6 / viewport.width, y: bypass ? 0 : 6 / viewport.height },
    );
    const result = clamp({ x: snapped.x - left, y: snapped.y - top });
    const constrained = result.x !== snapped.x - left || result.y !== snapped.y - top;
    return {
      translation: result,
      guides: constrained ? [] : snapped.guides,
      measurements: constrained ? [] : snapped.measurements,
    };
  };
}
