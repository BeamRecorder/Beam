import type { ScreenshotState } from '~/api/types/screenshot';
import { defaultLayerCompositing, reorderLayer } from '~/media/shared/layer-compositing';
import type { LayerCompositing } from '~/media/shared/layer-compositing-types';
import type { ScreenshotLayer } from './screenshot-layer-types';

export const SCREENSHOT_BACKGROUND_ID = '__background__';
export const SCREENSHOT_WATERMARK_ID = '__watermark__';

export function canRemoveScreenshotLayer(layer: ScreenshotLayer): boolean {
  return !layer.locked && (Boolean(layer.removable) || !['image', 'background', 'watermark'].includes(layer.kind));
}

export function screenshotLayers(state: ScreenshotState): ScreenshotLayer[] {
  const content = [
    { id: SCREENSHOT_BACKGROUND_ID, kind: 'background' as const, name: '', visible: state.canvas.showBackground },
    { id: state.image.id, kind: 'image' as const, name: state.image.name, visible: state.image.enabled },
    ...(state.images ?? []).map((layer) => ({
      id: layer.id,
      kind: 'image' as const,
      name: layer.name,
      visible: layer.enabled,
      removable: true,
    })),
    ...state.shapes.map((layer) => ({
      id: layer.id,
      kind: layer.family,
      name: layer.text?.content || layer.name,
      visible: layer.enabled,
    })),
    ...(state.effects ?? []).map((layer) => ({
      id: layer.id,
      kind: 'effect' as const,
      name: layer.name,
      visible: layer.enabled,
      removable: true,
    })),
    ...(state.cursors ?? []).map((layer) => ({
      id: layer.id,
      kind: 'cursor' as const,
      name: layer.name,
      visible: layer.enabled,
    })),
    {
      id: SCREENSHOT_WATERMARK_ID,
      kind: 'watermark' as const,
      name: '',
      visible: Boolean(state.canvas.watermark?.enabled),
    },
  ];
  const byId = new Map(content.map((layer) => [layer.id, layer]));
  const order = state.composition ?? content.map(({ id }) => defaultLayerCompositing(id));
  return order.flatMap((settings) => {
    const layer = byId.get(settings.id);
    return layer ? [{ ...layer, ...settings }] : [];
  });
}

export function initializeScreenshotComposition(state: ScreenshotState) {
  state.composition ??= screenshotLayers(state).map(({ id, opacity, blendMode, locked }) => ({
    id,
    opacity,
    blendMode,
    locked,
  }));
  state.cursors ??= [];
}
export function insertScreenshotLayer(state: ScreenshotState, id: string) {
  initializeScreenshotComposition(state);
  if (!state.composition!.some((layer) => layer.id === id)) state.composition!.push(defaultLayerCompositing(id));
}
export function updateScreenshotLayer(
  state: ScreenshotState,
  id: string,
  patch: Partial<Omit<LayerCompositing, 'id'>>,
) {
  initializeScreenshotComposition(state);
  const layer = state.composition!.find((layer) => layer.id === id);
  if (layer) Object.assign(layer, patch);
}
export function reorderScreenshotLayer(state: ScreenshotState, id: string, frontIndex: number) {
  initializeScreenshotComposition(state);
  state.composition = reorderLayer(state.composition!, id, state.composition!.length - 1 - frontIndex);
}
export function setScreenshotLayerVisible(state: ScreenshotState, id: string, visible: boolean) {
  if (id === SCREENSHOT_BACKGROUND_ID) state.canvas.showBackground = visible;
  else if (id === SCREENSHOT_WATERMARK_ID) {
    if (state.canvas.watermark) state.canvas.watermark.enabled = visible;
  } else {
    const layer =
      id === state.image.id
        ? state.image
        : [...state.shapes, ...(state.effects ?? []), ...(state.cursors ?? []), ...(state.images ?? [])].find(
            (layer) => layer.id === id,
          );
    if (layer) layer.enabled = visible;
  }
}
export function removeScreenshotLayer(state: ScreenshotState, id: string) {
  if (id === state.image.id || id === SCREENSHOT_BACKGROUND_ID || id === SCREENSHOT_WATERMARK_ID) return;
  state.shapes = state.shapes.filter((layer) => layer.id !== id);
  state.cursors = state.cursors?.filter((layer) => layer.id !== id);
  state.effects = state.effects?.filter((layer) => layer.id !== id);
  state.images = state.images?.filter((layer) => layer.id !== id);
  state.composition = state.composition?.filter((layer) => layer.id !== id);
}
