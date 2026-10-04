import { keepMediaResizeAnchor } from '@beam/engine/layout/media-rotation';
import type { NormalizedTransform } from '@beam/engine/shared/composition-types';
import type { ScreenshotState } from '@beam/engine/screenshot/screenshot-types';
import type { ScreenshotRenderAssets } from '@beam/runtime/screenshot/screenshot-types';
import { screenshotLayerRotation, screenshotLayerTransform } from './screenshot-layer-geometry';
import { withScreenshotTransform } from './screenshot-transform';

export function anchorScreenshotResize(
  state: ScreenshotState,
  id: string,
  resized: NormalizedTransform,
  assets: ScreenshotRenderAssets | null,
): NormalizedTransform {
  const rotation = screenshotLayerRotation(state, id);
  if (!rotation) return resized;
  const before = screenshotLayerTransform(state, assets, id);
  const after = screenshotLayerTransform(withScreenshotTransform(state, id, resized, assets), assets, id);
  if (!before || !after) return resized;
  const center = (value: NormalizedTransform) => ({
    x: (value.x + value.width / 2) * state.canvas.width,
    y: (value.y + value.height / 2) * state.canvas.height,
  });
  return keepMediaResizeAnchor(resized, center(before), center(after), rotation, state.canvas);
}
