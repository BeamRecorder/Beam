import type { ScreenshotState, ScreenshotLayer } from '@beam/engine/screenshot/screenshot-types';
import type { ScreenshotRenderAssets } from './screenshot-types';
import type { GradientRect } from '../gradient/gradient-types';
import { screenshotImage } from '@beam/engine/screenshot/screenshot-images';
import { screenshotImageFraming } from '@beam/engine/screenshot/screenshot-geometry';
import { frameOuterRect } from '@beam/engine/shared/frame-layout';
import { screenshotCursorTransform } from './screenshot-cursors';

export function screenshotLayerEffectRect(
  state: ScreenshotState,
  layer: ScreenshotLayer,
  assets: Partial<ScreenshotRenderAssets>,
  width: number,
  height: number,
): GradientRect {
  const image = screenshotImage(state, layer.id);
  if (image) {
    const asset = layer.id === state.image.id ? assets : assets.images?.get(layer.id);
    if (!asset?.width || !asset.height) throw new Error('Gradient image dimensions unavailable.');
    return {
      ...frameOuterRect(
        screenshotImageFraming({ ...state, image }, asset.width, asset.height, width, height).rect,
        image.appearance.frame,
      ),
      rotation: image.rotation,
    };
  }
  const shape = state.shapes.find((item) => item.id === layer.id);
  if (shape)
    return {
      x: shape.transform.x * width,
      y: shape.transform.y * height,
      width: shape.transform.width * width,
      height: shape.transform.height * height,
      rotation: shape.rotation,
    };
  const cursor = state.cursors?.find((item) => item.id === layer.id);
  if (cursor) {
    const asset = assets.cursors?.get(layer.id);
    if (!asset) throw new Error('Gradient cursor dimensions unavailable.');
    const transform = screenshotCursorTransform(cursor, state.canvas, asset.asset);
    return {
      x: transform.x * width,
      y: transform.y * height,
      width: transform.width * width,
      height: transform.height * height,
      rotation: cursor.rotation,
    };
  }
  return { x: 0, y: 0, width, height };
}
