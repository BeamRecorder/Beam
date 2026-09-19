import type { ScreenshotState } from '~/api/types/screenshot';
import type { NormalizedTransform } from '~/media/shared/composition-types';
import {
  canRemoveScreenshotLayer,
  initializeScreenshotComposition,
  SCREENSHOT_BACKGROUND_ID,
  SCREENSHOT_WATERMARK_ID,
  screenshotLayers,
} from './screenshot-layers';
import type {
  ScreenshotClipboardEntry,
  ScreenshotClipboardLayer,
  ScreenshotClipboardSource,
  ScreenshotLayerClipboard,
  ScreenshotPasteResult,
  ScreenshotSpecialLayerCopies,
} from './screenshot-layer-clipboard-types';
import type { ScreenshotImageLayer } from './screenshot-layer-types';

const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;
const MAX_SCREENSHOT_OVERLAY_LAYERS = 500;
const MAX_SCREENSHOT_STATE_CHARACTERS = 2_000_000;

export const capturedScreenshotClipboardLayer = (
  state: ScreenshotState,
  source: ScreenshotClipboardSource,
): ScreenshotImageLayer => ({
  ...clone(state.image),
  kind: 'image',
  source: source.source,
  width: source.width,
  height: source.height,
});

const clipboardLayer = (
  state: ScreenshotState,
  id: string,
  specialLayers: ScreenshotSpecialLayerCopies,
): ScreenshotClipboardLayer | null => {
  if (id === state.image.id && specialLayers.capturedImage)
    return { type: 'image', value: clone(specialLayers.capturedImage) };
  if (id === SCREENSHOT_BACKGROUND_ID && specialLayers.background)
    return { type: 'image', value: clone(specialLayers.background) };
  if (id === SCREENSHOT_WATERMARK_ID && specialLayers.watermark)
    return { type: 'image', value: clone(specialLayers.watermark) };
  const shape = state.shapes.find((layer) => layer.id === id);
  if (shape) return { type: 'shape', value: clone(shape) };
  const effect = state.effects?.find((layer) => layer.id === id);
  if (effect) return { type: 'effect', value: clone(effect) };
  const cursor = state.cursors?.find((layer) => layer.id === id);
  if (cursor) return { type: 'cursor', value: clone(cursor) };
  const image = state.images?.find((layer) => layer.id === id);
  return image ? { type: 'image', value: clone(image) } : null;
};

export function copyScreenshotLayerSelection(
  state: ScreenshotState,
  selectedIds: readonly string[],
  primaryId: string | null,
  requireUnlocked = false,
  specialLayers: ScreenshotSpecialLayerCopies = {},
): ScreenshotLayerClipboard | null {
  const selected = new Set(selectedIds);
  const entries: ScreenshotClipboardEntry[] = [];
  let primaryIndex = -1;
  for (const layer of screenshotLayers(state)) {
    if (!selected.has(layer.id)) continue;
    if (requireUnlocked && !canRemoveScreenshotLayer(layer)) return null;
    const value = clipboardLayer(state, layer.id, specialLayers);
    if (!value) continue;
    if (layer.id === primaryId) primaryIndex = entries.length;
    entries.push({
      layer: value,
      name: layer.name || value.value.name,
      opacity: layer.opacity,
      blendMode: layer.blendMode,
    });
  }
  if (!entries.length) return null;
  return { entries, primaryIndex: primaryIndex >= 0 ? primaryIndex : entries.length - 1 };
}

const offsetTransform = (value: NormalizedTransform, canvas: ScreenshotState['canvas']): NormalizedTransform => {
  const dx = 24 / Math.max(1, canvas.width);
  const dy = 24 / Math.max(1, canvas.height);
  return {
    ...value,
    x: Math.max(0.01 - value.width, Math.min(0.99, value.x + dx)),
    y: Math.max(0.01 - value.height, Math.min(0.99, value.y + dy)),
  };
};

export function pasteScreenshotLayerSelection(
  state: ScreenshotState,
  clipboard: ScreenshotLayerClipboard,
  idFactory: () => string = () => crypto.randomUUID(),
): ScreenshotPasteResult {
  if (!clipboard.entries.length) throw new Error('The screenshot clipboard is empty.');
  const existingIds = new Set(screenshotLayers(state).map((layer) => layer.id));
  const ids = clipboard.entries.map(() => {
    const id = idFactory();
    if (!id || existingIds.has(id)) throw new Error('The pasted screenshot layer has an invalid identifier.');
    existingIds.add(id);
    return id;
  });
  const next: ScreenshotState = {
    ...state,
    shapes: [...state.shapes],
    effects: state.effects ? [...state.effects] : undefined,
    cursors: state.cursors ? [...state.cursors] : undefined,
    images: state.images ? [...state.images] : undefined,
    composition: state.composition ? [...state.composition] : undefined,
  };
  initializeScreenshotComposition(next);
  const names: string[] = [];
  clipboard.entries.forEach((entry, index) => {
    const id = ids[index]!;
    if (entry.layer.type === 'cursor') {
      const value = { ...clone(entry.layer.value), id };
      value.position = {
        x: Math.min(0.99, value.position.x + 24 / Math.max(1, next.canvas.width)),
        y: Math.min(0.99, value.position.y + 24 / Math.max(1, next.canvas.height)),
      };
      next.cursors!.push(value);
    } else if (entry.layer.type === 'shape') {
      const value = { ...clone(entry.layer.value), id, trackId: id };
      value.transform = offsetTransform(value.transform, next.canvas);
      next.shapes.push(value);
    } else if (entry.layer.type === 'effect') {
      const value = { ...clone(entry.layer.value), id, trackId: id };
      value.transform = offsetTransform(value.transform, next.canvas);
      (next.effects ??= []).push(value);
    } else {
      const value = { ...clone(entry.layer.value), id };
      value.transform = offsetTransform(value.transform, next.canvas);
      if (value.trackId) value.trackId = id;
      (next.images ??= []).push(value);
    }
    next.composition!.push({
      id,
      opacity: entry.opacity,
      blendMode: entry.blendMode,
      locked: false,
    });
    names.push(entry.name);
  });
  const overlayCount =
    next.shapes.length + (next.effects?.length ?? 0) + (next.cursors?.length ?? 0) + (next.images?.length ?? 0);
  if (overlayCount > MAX_SCREENSHOT_OVERLAY_LAYERS || JSON.stringify(next).length > MAX_SCREENSHOT_STATE_CHARACTERS)
    throw new Error('The screenshot has reached its layer or document size limit.');
  state.shapes = next.shapes;
  state.effects = next.effects;
  state.cursors = next.cursors;
  state.images = next.images;
  state.composition = next.composition;
  return {
    ids,
    primaryId: ids[Math.min(clipboard.primaryIndex, ids.length - 1)]!,
    names,
  };
}
