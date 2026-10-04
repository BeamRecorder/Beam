import { layerPerspectiveCorners, pointInsideLayerQuad } from '@beam/engine/layout/layer-perspective';
import { effectShapeRect } from '@beam/runtime/composition/effects/effect-shape';
import type { ScreenshotState } from '@beam/engine/screenshot/screenshot-types';
import type { NormalizedTransform } from '@beam/engine/shared/composition-types';
import { frameOuterRect } from '@beam/engine/shared/frame-layout';
import { screenshotImageFraming } from '@beam/engine/screenshot/screenshot-geometry';
import { screenshotCursorTransform } from '@beam/runtime/screenshot/screenshot-cursors';
import { screenshotLayers } from '@beam/engine/screenshot/screenshot-layers';
import type { ScreenshotRenderAssets } from '@beam/runtime/screenshot/screenshot-types';
import { screenshotImage } from '@beam/engine/screenshot/screenshot-images';

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
    return {
      x: rect.x / width,
      y: rect.y / height,
      width: rect.width / width,
      height: rect.height / height,
    };
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
    return {
      x: rect.x / width,
      y: rect.y / height,
      width: rect.width / width,
      height: rect.height / height,
    };
  }
  const cursor = state.cursors?.find((cursor) => cursor.id === id);
  const asset = assets?.cursors?.get(id)?.asset;
  if (cursor) return asset ? screenshotCursorTransform(cursor, state.canvas, asset) : null;
  return state.shapes.find((shape) => shape.id === id)?.transform ?? null;
}
export function screenshotLayerRotation(state: ScreenshotState, id: string) {
  return (
    screenshotImage(state, id)?.rotation ??
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
  if (![x, y].every(Number.isFinite) || x < 0 || y < 0 || x > 1 || y > 1) return null;
  for (const layer of screenshotLayers(state).reverse()) {
    if (!layer.visible || layer.locked || layer.opacity === 0) continue;
    if (layer.kind === 'background') continue;
    const rect = screenshotLayerTransform(state, assets, layer.id);
    if (!rect) continue;
    const bounds = { x: rect.x * state.canvas.width, y: rect.y * state.canvas.height, width: rect.width * state.canvas.width, height: rect.height * state.canvas.height };
    const corners = layerPerspectiveCorners(bounds, layer.rotation3d, screenshotLayerRotation(state, layer.id));
    if (pointInsideLayerQuad({ x: x * state.canvas.width, y: y * state.canvas.height }, corners)) return layer.id;
  }
  return null;
}

/** Projected bounds shared by marquee selection and alignment measurements. */
export function screenshotLayerBounds(state: ScreenshotState, assets: ScreenshotRenderAssets | null, id: string): NormalizedTransform | null {
  const t = screenshotLayerTransform(state, assets, id);
  if (!t) return null;
  const rect = { x: t.x * state.canvas.width, y: t.y * state.canvas.height, width: t.width * state.canvas.width, height: t.height * state.canvas.height };
  const rotation3d = state.composition?.find((layer) => layer.id === id)?.rotation3d;
  const corners = layerPerspectiveCorners(rect, rotation3d, screenshotLayerRotation(state, id));
  const x = Math.min(...corners.map((p) => p.x)), y = Math.min(...corners.map((p) => p.y));
  return { x: x / state.canvas.width, y: y / state.canvas.height, width: (Math.max(...corners.map((p) => p.x)) - x) / state.canvas.width, height: (Math.max(...corners.map((p) => p.y)) - y) / state.canvas.height };
}
