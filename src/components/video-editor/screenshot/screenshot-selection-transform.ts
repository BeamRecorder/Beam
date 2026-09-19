import type { ScreenshotState } from '~/api/types/screenshot';
import type { ScreenshotRenderAssets, ScreenshotTranslation } from './screenshot-types';
import { screenshotLayers } from './screenshot-layers';
import { screenshotImage } from './screenshot-images';
import { screenshotLayerTransform } from './screenshot-layer-geometry';
import { computeCanvasAlignmentSnapping } from '../canvas/composables/canvas-alignment';

export function movableScreenshotSelection(state: ScreenshotState, ids: readonly string[]) {
  const selected = new Set(ids);
  return screenshotLayers(state).filter(
    (layer) =>
      selected.has(layer.id) && layer.visible && !layer.locked && !['background', 'watermark'].includes(layer.kind),
  );
}

/** Constrain one shared delta so the members keep their spacing at the canvas edges. */
export function constrainScreenshotTranslation(
  state: ScreenshotState,
  ids: readonly string[],
  delta: ScreenshotTranslation,
  assets: ScreenshotRenderAssets | null,
): ScreenshotTranslation {
  const transforms = movableScreenshotSelection(state, ids).flatMap(({ id }) => {
    const transform = screenshotImage(state, id)?.transform ?? screenshotLayerTransform(state, assets, id);
    return transform ? [transform] : [];
  });
  if (!transforms.length) return { x: 0, y: 0 };
  return {
    x: Math.max(
      Math.max(...transforms.map((t) => -t.width + 0.01 - t.x)),
      Math.min(delta.x, ...transforms.map((t) => 0.99 - t.x)),
    ),
    y: Math.max(
      Math.max(...transforms.map((t) => -t.height + 0.01 - t.y)),
      Math.min(delta.y, ...transforms.map((t) => 0.99 - t.y)),
    ),
  };
}

export function snapScreenshotTranslation(
  state: ScreenshotState,
  ids: readonly string[],
  delta: ScreenshotTranslation,
  assets: ScreenshotRenderAssets | null,
) {
  const translation = constrainScreenshotTranslation(state, ids, delta, assets);
  const preview = withScreenshotTranslation(state, ids, translation);
  const selected = new Set(ids);
  const moved = movableScreenshotSelection(preview, ids).flatMap(({ id }) => {
    const transform = screenshotLayerTransform(preview, assets, id);
    return transform ? [transform] : [];
  });
  if (!moved.length) return { translation, guides: [] };
  const left = Math.min(...moved.map(({ x }) => x));
  const top = Math.min(...moved.map(({ y }) => y));
  const right = Math.max(...moved.map(({ x, width }) => x + width));
  const bottom = Math.max(...moved.map(({ y, height }) => y + height));
  const otherTargets = screenshotLayers(state).flatMap((layer) => {
    if (
      selected.has(layer.id) ||
      !layer.visible ||
      layer.locked ||
      layer.opacity === 0 ||
      ['background', 'watermark'].includes(layer.kind)
    )
      return [];
    const transform = screenshotLayerTransform(state, assets, layer.id);
    return transform ? [{ id: layer.id, ...transform }] : [];
  });
  const snap = computeCanvasAlignmentSnapping(
    { x: left, y: top, width: right - left, height: bottom - top },
    otherTargets,
    0.015,
  );
  return {
    translation: constrainScreenshotTranslation(
      state,
      ids,
      { x: translation.x + snap.x - left, y: translation.y + snap.y - top },
      assets,
    ),
    guides: snap.guides,
  };
}

/** Clone only moving records; previews never mutate the document or its undo history. */
export function withScreenshotTranslation(
  state: ScreenshotState,
  ids: readonly string[],
  delta: ScreenshotTranslation,
): ScreenshotState {
  const moving = new Set(movableScreenshotSelection(state, ids).map((layer) => layer.id));
  const translate = <T extends { x: number; y: number }>(value: T): T => ({
    ...value,
    x: value.x + delta.x,
    y: value.y + delta.y,
  });
  return {
    ...state,
    image: moving.has(state.image.id) ? { ...state.image, transform: translate(state.image.transform) } : state.image,
    images: state.images?.map((layer) =>
      moving.has(layer.id) ? { ...layer, transform: translate(layer.transform) } : layer,
    ),
    shapes: state.shapes.map((layer) =>
      moving.has(layer.id) ? { ...layer, transform: translate(layer.transform) } : layer,
    ),
    effects: state.effects?.map((layer) =>
      moving.has(layer.id) ? { ...layer, transform: translate(layer.transform) } : layer,
    ),
    cursors: state.cursors?.map((layer) =>
      moving.has(layer.id) ? { ...layer, position: translate(layer.position) } : layer,
    ),
  };
}

/** Commit coordinates in place so source/font watchers keep their decoded assets. */
export function applyScreenshotTranslation(
  state: ScreenshotState,
  ids: readonly string[],
  delta: ScreenshotTranslation,
) {
  const moving = new Set(movableScreenshotSelection(state, ids).map((layer) => layer.id));
  const layers = [
    state.image,
    ...(state.images ?? []),
    ...state.shapes,
    ...(state.effects ?? []),
    ...(state.cursors ?? []),
  ];
  for (const layer of layers) {
    if (!moving.has(layer.id)) continue;
    const position = 'transform' in layer ? layer.transform : layer.position;
    position.x += delta.x;
    position.y += delta.y;
  }
}
