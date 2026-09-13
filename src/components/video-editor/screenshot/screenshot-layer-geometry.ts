import { effectShapeRect } from '../composition/effects/effect-shape';
import type { ScreenshotState } from '~/api/types/screenshot';
import type { NormalizedTransform } from '~/media/shared/composition-types';
import { frameOuterRect } from '../composition/appearance/frames';
import { screenshotImageFraming } from './screenshot-geometry';
import { screenshotCursorTransform } from './screenshot-cursors';
import { screenshotLayers } from './screenshot-layers';
import type { ScreenshotRenderAssets } from './screenshot-types';
import { screenshotImage } from './screenshot-images';

export function screenshotLayerTransform(
  state: ScreenshotState,
  assets: Pick<ScreenshotRenderAssets, 'width' | 'height' | 'cursors' | 'images'> | null,
  id: string,
): NormalizedTransform | null {
  const image = screenshotImage(state, id);
  if (image) {
    const asset = id === state.image.id ? assets : assets?.images?.get(id);
    if (!asset) return image.transform;
    const { width, height } = state.canvas;
    const framing = screenshotImageFraming({ ...state, image }, asset.width, asset.height, width, height);
    const rect = frameOuterRect(framing.rect, image.appearance.frame);
    return { x: rect.x / width, y: rect.y / height, width: rect.width / width, height: rect.height / height };
  }
  const effect = state.effects?.find((item) => item.id === id);
  if (effect) {
    const { width, height } = state.canvas;
    const t = effect.transform;
    const rect = effectShapeRect(effect.shape, {
      x: t.x * width,
      y: t.y * height,
      width: t.width * width,
      height: t.height * height,
    });
    return { x: rect.x / width, y: rect.y / height, width: rect.width / width, height: rect.height / height };
  }
  const cursor = state.cursors?.find((cursor) => cursor.id === id);
  const asset = assets?.cursors?.get(id)?.asset;
  if (cursor) return asset ? screenshotCursorTransform(cursor, state.canvas, asset) : null;
  return state.shapes.find((shape) => shape.id === id)?.transform ?? null;
}
export function screenshotLayerRotation(state: ScreenshotState, id: string) {
  return (
    state.shapes.find((shape) => shape.id === id)?.rotation ??
    state.cursors?.find((cursor) => cursor.id === id)?.rotation ??
    0
  );
}
export function screenshotLayerAt(
  state: ScreenshotState,
  assets: ScreenshotRenderAssets | null,
  x: number,
  y: number,
): string | null {
  for (const layer of screenshotLayers(state).reverse()) {
    if (!layer.visible || layer.locked || layer.opacity === 0) continue;
    if (layer.kind === 'background') return layer.id;
    const rect = screenshotLayerTransform(state, assets, layer.id);
    if (!rect) continue;
    const angle = (-screenshotLayerRotation(state, layer.id) * Math.PI) / 180;
    const dx = (x - rect.x - rect.width / 2) * state.canvas.width;
    const dy = (y - rect.y - rect.height / 2) * state.canvas.height;
    const localX = dx * Math.cos(angle) - dy * Math.sin(angle);
    const localY = dx * Math.sin(angle) + dy * Math.cos(angle);
    if (
      Math.abs(localX) <= (rect.width * state.canvas.width) / 2 &&
      Math.abs(localY) <= (rect.height * state.canvas.height) / 2
    )
      return layer.id;
  }
  return null;
}
