import { validateScreenshotGroups } from './screenshot-group-schema.js';
import { validateLayerRotation3d } from '../layout/layer-perspective-schema.js';
import type { StillDocument } from './still-document-types';
import type { ScreenshotState } from './screenshot-types';
import { DEFAULT_OUTPUT_CANVAS } from '../layout/output-canvas';
import { createDefaultClipAppearance } from '../shared/composition-defaults';
import { emptyComposition, type Clip } from '../shared/composition-types';
import { validateComposition } from '../commands/clip-composition-validation';
import { validScreenshotDimensions } from './screenshot-dimensions';
import { initializeScreenshotComposition } from './screenshot-layers';
import { validateCanvas, validateBackground } from '../document/presentation-validation';
import { LAYER_BLEND_MODES } from '../shared/layer-compositing';
import { assertJsonValue } from '../document/json-value';
import { validateStillZoom } from '../zoom/zoom-schema.js';
import { validateLayerEffects } from '../gradient/gradient-schema.js';
import { validateHtmlComposition } from '../html/html-schema.js';

export function createStillDocument(id: string, source: string, width: number, height: number): StillDocument {
  const state: ScreenshotState = {
    canvas: {
      ...DEFAULT_OUTPUT_CANVAS,
      preset: 'custom',
      width,
      height,
      showBackground: false,
    },
    background: null,
    blurPercent: 0,
    format: 'png',
    quality: 1,
    shapes: [],
    image: {
      id: 'image',
      kind: 'image',
      name: 'Image',
      assetId: 'source',
      enabled: true,
      order: 0,
      timelineStartMs: 0,
      timelineDurationMs: 1,
      sourceInMs: 0,
      sourceDurationMs: 1,
      playbackRate: 1,
      transitions: { entry: null, exit: null },
      transform: { x: 0, y: 0, width: 1, height: 1 },
      appearance: createDefaultClipAppearance('image'),
      isMirrored: false,
      isMirroredY: false,
      cameraFramingPreset: 'fit',
    },
  };
  initializeScreenshotComposition(state);
  const document: StillDocument = {
    version: 1,
    kind: 'image',
    id,
    source,
    width,
    height,
    state,
  };
  validateStillDocument(document);
  return document;
}

export function validateScreenshotState(state: ScreenshotState) {
  assertJsonValue(state);
  if (
    !state ||
    !validScreenshotDimensions(state.canvas) ||
    !['png', 'webp'].includes(state.format) ||
    !Number.isFinite(state.quality) ||
    state.quality < 0 ||
    state.quality > 1 ||
    !Number.isFinite(state.blurPercent) ||
    state.blurPercent < 0 ||
    state.blurPercent > 100 ||
    !Array.isArray(state.shapes) ||
    state.image?.kind !== 'image'
  )
    throw new TypeError('Invalid still document state.');
  validateCanvas(state.canvas);
  validateBackground(state.background, true);
  for (const image of state.images ?? [])
    if (typeof image.source !== 'string' || !image.source || !validScreenshotDimensions(image))
      throw new TypeError('Invalid still image source.');
  for (const image of state.images ?? []) {
    if (image.html !== undefined) {
      validateHtmlComposition(image.html);
      if (image.html.durationMs !== 0) throw new TypeError('A screenshot HTML layer must be static.');
    }
  }
  const clips: Clip[] = [state.image, ...state.shapes, ...(state.images ?? []), ...(state.effects ?? [])];
  for (const clip of [...clips, ...(state.cursors ?? [])]) {
    if (['__background__', '__watermark__'].includes(clip.id)) throw new TypeError('Reserved still layer id.');
    if ('animations' in clip || 'animation' in clip || 'keyframes' in clip)
      throw new TypeError('Still layers cannot animate.');
  }
  // Still layers share clip validation while their authored duration remains one image.
  const normalized = clips.map((clip) => ({
    ...clip,
    trackId: `still:${clip.id}`,
    groupId: undefined,
    timelineStartMs: 0,
    timelineDurationMs: 40,
    sourceInMs: 0,
    sourceDurationMs: 40,
    playbackRate: 1,
    transitions: { entry: null, exit: null },
  }));
  const images = [...new Map([state.image, ...(state.images ?? [])].map((image) => [image.assetId, image])).values()];
  validateComposition({
    ...emptyComposition(),
    clips: normalized,
    assets: images.map((image) => ({
      id: image.assetId,
      kind: 'image',
      name: image.name,
      fileName: null,
      src: '',
      durationMs: 0,
      width: 1,
      height: 1,
      origin: 'project',
    })),
  });
  const ids = new Set(clips.map((clip) => clip.id));
  if (state.zooms !== undefined && !Array.isArray(state.zooms)) throw new TypeError('Invalid still zoom layers.');
  for (const zoom of state.zooms ?? []) {
    validateStillZoom(zoom);
    if (ids.has(zoom.id) || ['__background__', '__watermark__'].includes(zoom.id))
      throw new TypeError('Duplicate still zoom id.');
    ids.add(zoom.id);
  }
  for (const cursor of state.cursors ?? []) {
    if (
      typeof cursor.id !== 'string' ||
      !cursor.id ||
      typeof cursor.enabled !== 'boolean' ||
      typeof cursor.color !== 'string' ||
      typeof cursor.shadowEnabled !== 'boolean' ||
      typeof cursor.shadowColor !== 'string' ||
      !['all', 'bottom', 'bottom-right', 'top-left'].includes(cursor.shadowDirection) ||
      ids.has(cursor.id) ||
      ![cursor.position.x, cursor.position.y, cursor.size, cursor.rotation, cursor.shadowBlur].every(Number.isFinite) ||
      cursor.size <= 0 ||
      cursor.shadowBlur < 0 ||
      cursor.selection?.mode !== 'fixed' ||
      !cursor.selection.cursorId
    )
      throw new TypeError('Invalid still cursor layer.');
    ids.add(cursor.id);
  }
  validateScreenshotGroups(state.composition ?? []);
  const seen = new Set<string>();
  for (const layer of state.composition ?? []) {
    if (
      seen.has(layer.id) ||
      (!ids.has(layer.id) && !['__background__', '__watermark__'].includes(layer.id)) ||
      !Number.isFinite(layer.opacity) ||
      layer.opacity < 0 ||
      layer.opacity > 100 ||
      !LAYER_BLEND_MODES.includes(layer.blendMode) ||
      typeof layer.locked !== 'boolean'
    )
      throw new TypeError('Invalid still layer composition.');
    if (layer.rotation3d !== undefined) validateLayerRotation3d(layer.rotation3d);
    if (layer.effects !== undefined) {
      validateLayerEffects(layer.effects, LAYER_BLEND_MODES);
      if (
        layer.effects.length &&
        (state.effects?.some((item) => item.id === layer.id) || state.zooms?.some((item) => item.id === layer.id))
      )
        throw new TypeError('Backdrop effects cannot carry layer fills.');
    }
    seen.add(layer.id);
  }
}

export function validateStillDocument(document: StillDocument) {
  assertJsonValue(document);
  if (
    document.version !== 1 ||
    document.kind !== 'image' ||
    typeof document.id !== 'string' ||
    !document.id ||
    typeof document.source !== 'string' ||
    !document.source ||
    !validScreenshotDimensions(document)
  )
    throw new TypeError('Invalid still document.');
  validateScreenshotState(document.state);
}
