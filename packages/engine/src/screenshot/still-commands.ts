import { createCommandRegistry } from '../commands/command-registry';
import { LAYER_BLEND_MODES } from '../shared/layer-compositing';
import { jsonObject } from '../document/json-value';
import type { StillDocument } from './still-document-types';
import type {
  ScreenshotState,
  ScreenshotCursorLayer,
  ScreenshotImageLayer,
  ScreenshotZoomLayer,
} from './screenshot-types';
import type { ShapeClip, BlurClip } from '../shared/composition-types';
import {
  insertScreenshotLayer,
  removeScreenshotLayer,
  reorderScreenshotLayer,
  setScreenshotLayerVisible,
} from './screenshot-layers';

const layerId = (input: unknown) => {
  const value = jsonObject(input);
  if (typeof value.layerId !== 'string' || !value.layerId) throw new TypeError('Layer requires an id.');
  return value.layerId;
};
const editable = (document: StillDocument, id: string) => {
  if (!document.state.composition?.some((layer) => layer.id === id)) throw new Error('Unknown layer.');
  if (document.state.composition.some((layer) => layer.id === id && layer.locked)) throw new Error('Layer is locked.');
};
const mutableState = (state: ScreenshotState, targetId?: string): ScreenshotState => ({
  ...state,
  canvas: {
    ...state.canvas,
    ...(state.canvas.watermark ? { watermark: { ...state.canvas.watermark } } : {}),
  },
  image: state.image.id === targetId ? { ...state.image } : state.image,
  ...(state.composition
    ? { composition: state.composition.map((layer) => (layer.id === targetId ? { ...layer } : layer)) }
    : {}),
  shapes: state.shapes.map((layer) => (layer.id === targetId ? { ...layer } : layer)),
  ...(state.images ? { images: state.images.map((layer) => (layer.id === targetId ? { ...layer } : layer)) } : {}),
  ...(state.effects ? { effects: state.effects.map((layer) => (layer.id === targetId ? { ...layer } : layer)) } : {}),
  ...(state.cursors ? { cursors: state.cursors.map((layer) => (layer.id === targetId ? { ...layer } : layer)) } : {}),
  ...(state.zooms ? { zooms: state.zooms.map((layer) => (layer.id === targetId ? { ...layer } : layer)) } : {}),
});

export function createStillCommands() {
  const registry = createCommandRegistry<StillDocument>();
  registry.register({
    type: 'still.layer.add',
    parse: jsonObject,
    apply(document, input) {
      const state = mutableState(document.state);
      if (typeof input.id !== 'string' || !input.id || state.composition?.some((layer) => layer.id === input.id))
        throw new TypeError('Layer id must be new.');
      if (input.kind === 'image') state.images = [...(state.images ?? []), input as unknown as ScreenshotImageLayer];
      else if (input.kind === 'blur') state.effects = [...(state.effects ?? []), input as unknown as BlurClip];
      else if (input.kind === 'cursor')
        state.cursors = [...(state.cursors ?? []), input as unknown as ScreenshotCursorLayer];
      else if (input.kind === 'shape') state.shapes = [...state.shapes, input as unknown as ShapeClip];
      else if (input.kind === 'zoom') state.zooms = [...(state.zooms ?? []), input as unknown as ScreenshotZoomLayer];
      else throw new TypeError('Unsupported still layer kind.');
      insertScreenshotLayer(state, input.id);
      return { ...document, state };
    },
  });
  registry.register({
    type: 'still.layer.patch',
    parse(input) {
      const value = jsonObject(input),
        patch = jsonObject(value.patch);
      if (
        [
          'id',
          'kind',
          'animations',
          'keyframes',
          'startMs',
          'endMs',
          'timelineStartMs',
          'timelineDurationMs',
          'sourceInMs',
          'sourceDurationMs',
          'playbackRate',
          'transitions',
        ].some((key) => key in patch)
      )
        throw new TypeError('Cannot animate or change a still layer identity.');
      return { id: layerId(input), patch };
    },
    apply(document, { id, patch }) {
      editable(document, id);
      const state = mutableState(document.state, id);
      const layer = [
        state.image,
        ...state.shapes,
        ...(state.images ?? []),
        ...(state.effects ?? []),
        ...(state.cursors ?? []),
        ...(state.zooms ?? []),
      ].find((layer) => layer.id === id);
      if (!layer) throw new Error('This layer has separate canvas settings.');
      Object.assign(layer, patch);
      return { ...document, state };
    },
  });
  registry.register({
    type: 'still.layer.delete',
    parse: layerId,
    apply(document, id) {
      editable(document, id);
      const state = mutableState(document.state, id);
      removeScreenshotLayer(state, id);
      return { ...document, state };
    },
  });
  registry.register({
    type: 'still.layer.reorder',
    parse(input) {
      const value = jsonObject(input);
      if (!Number.isInteger(value.index)) throw new TypeError('Layer index must be an integer.');
      return { id: layerId(input), index: value.index as number };
    },
    apply(document, { id, index }) {
      editable(document, id);
      const state = mutableState(document.state);
      reorderScreenshotLayer(state, id, index);
      return { ...document, state };
    },
  });
  registry.register({
    type: 'still.layer.enable',
    parse(input) {
      const value = jsonObject(input);
      if (typeof value.enabled !== 'boolean') throw new TypeError('Layer enabled must be a boolean.');
      return { id: layerId(input), enabled: value.enabled };
    },
    apply(document, { id, enabled }) {
      editable(document, id);
      const state = mutableState(document.state, id);
      setScreenshotLayerVisible(state, id, enabled);
      return { ...document, state };
    },
  });
  registry.register({
    type: 'still.layer.compositing',
    parse(input) {
      const value = jsonObject(input),
        patch = jsonObject(value.patch);
      if (
        Object.keys(patch).some((key) => !['opacity', 'blendMode', 'locked'].includes(key)) ||
        ('opacity' in patch && (typeof patch.opacity !== 'number' || patch.opacity < 0 || patch.opacity > 100)) ||
        ('locked' in patch && typeof patch.locked !== 'boolean') ||
        ('blendMode' in patch && !LAYER_BLEND_MODES.includes(patch.blendMode as never))
      )
        throw new TypeError('Invalid layer compositing.');
      return { id: layerId(input), patch };
    },
    apply(document, { id, patch }) {
      const existing = document.state.composition?.find((layer) => layer.id === id);
      if (!existing) throw new Error('Unknown layer.');
      if (existing.locked && Object.keys(patch).some((key) => key !== 'locked')) throw new Error('Layer is locked.');
      return {
        ...document,
        state: {
          ...document.state,
          composition: document.state.composition!.map((layer) =>
            layer.id === id ? ({ ...layer, ...patch } as typeof layer) : layer,
          ),
        },
      };
    },
  });
  registry.register({
    type: 'still.settings.patch',
    parse(input) {
      const patch = jsonObject(input);
      if (Object.keys(patch).some((key) => !['format', 'quality', 'blurPercent'].includes(key)))
        throw new TypeError('Invalid still setting.');
      return patch;
    },
    apply: (document, patch) => ({ ...document, state: { ...document.state, ...patch } as ScreenshotState }),
  });
  registry.register({
    type: 'still.canvas.set',
    parse: jsonObject,
    apply(document, input) {
      return {
        ...document,
        state: {
          ...document.state,
          canvas: input as unknown as ScreenshotState['canvas'],
        },
      };
    },
  });
  registry.register({
    type: 'still.background.set',
    parse: (input) => (input === null ? null : jsonObject(input)),
    apply(document, input) {
      return {
        ...document,
        state: {
          ...document.state,
          background: input as unknown as NonNullable<ScreenshotState['background']>,
        },
      };
    },
  });
  return registry;
}
