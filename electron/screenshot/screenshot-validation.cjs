const { normalizeShapeLayerStyle } = require('../projects/composition-shape-layer.cjs');
const { normalizeAppearance } = require('../projects/composition-appearance.cjs');
const { validateScreenshotComposition } = require('./screenshot-composition-validation.cjs');

const finite = (value) => typeof value === 'number' && Number.isFinite(value);
const transform = (value) =>
  value &&
  [value.x, value.y, value.width, value.height].every(finite) &&
  value.width > 0 &&
  value.height > 0 &&
  value.width <= 10 &&
  value.height <= 10 &&
  Math.abs(value.x) <= 10 &&
  Math.abs(value.y) <= 10;
const validCrop = (crop) =>
  crop == null ||
  (crop &&
    [crop.x, crop.y, crop.width, crop.height].every(finite) &&
    crop.x >= 0 &&
    crop.y >= 0 &&
    crop.width >= 0.05 - Number.EPSILON &&
    crop.height >= 0.05 - Number.EPSILON &&
    crop.x + crop.width <= 1 + Number.EPSILON &&
    crop.y + crop.height <= 1 + Number.EPSILON);
const dimensions = (width, height) =>
  [width, height].every((value) => Number.isInteger(value) && value > 0 && value <= 16384) &&
  width * height <= 67_108_864;

function validateScreenshotState(state, projectId) {
  if (
    !state ||
    typeof state !== 'object' ||
    JSON.stringify(state).length > 2_000_000 ||
    !['png', 'webp'].includes(state.format) ||
    !finite(state.quality) ||
    state.quality < 0 ||
    state.quality > 1 ||
    !finite(state.blurPercent) ||
    state.blurPercent < 0 ||
    state.blurPercent > 100 ||
    !state.canvas ||
    !dimensions(state.canvas.width, state.canvas.height) ||
    typeof state.canvas.showBackground !== 'boolean' ||
    state.image?.kind !== 'image' ||
    typeof state.image.id !== 'string' ||
    !transform(state.image.transform) ||
    !validCrop(state.image.crop) ||
    !Array.isArray(state.shapes) ||
    state.shapes.length > 500
  )
    throw new Error('Invalid screenshot settings.');
  normalizeAppearance(state.image.appearance);
  if (state.image.enabled !== undefined && typeof state.image.enabled !== 'boolean')
    throw new Error('Invalid screenshot visibility.');
  state.image.enabled ??= true;
  if (state.images !== undefined) {
    if (!Array.isArray(state.images) || state.images.length + state.shapes.length + (state.cursors?.length ?? 0) > 500)
      throw new Error('Invalid screenshot image layers.');
    for (const image of state.images) {
      if (
        !image ||
        image.kind !== 'image' ||
        typeof image.id !== 'string' ||
        !image.id ||
        typeof image.name !== 'string' ||
        image.name.length > 200 ||
        typeof image.assetId !== 'string' ||
        !image.assetId ||
        typeof image.source !== 'string' ||
        !/^project-media:\/\/screenshot\/[0-9a-f-]{36}\/media\/[0-9a-f-]{36}\.(png|jpg|jpeg|webp)$/.test(
          image.source,
        ) ||
        (projectId !== undefined && !image.source.startsWith(`project-media://screenshot/${projectId}/media/`)) ||
        !dimensions(image.width, image.height) ||
        !transform(image.transform) ||
        !validCrop(image.crop) ||
        typeof image.enabled !== 'boolean' ||
        typeof image.isMirrored !== 'boolean' ||
        typeof image.isMirroredY !== 'boolean'
      )
        throw new Error('Invalid screenshot image.');
      image.appearance = normalizeAppearance(image.appearance);
    }
  }
  const identifiers = new Set([state.image.id]);
  for (const shape of state.shapes) {
    if (
      !shape ||
      shape.kind !== 'shape' ||
      !['shape', 'arrow', 'text', 'drawing'].includes(shape.family) ||
      typeof shape.id !== 'string' ||
      !shape.id ||
      identifiers.has(shape.id) ||
      !transform(shape.transform) ||
      typeof shape.enabled !== 'boolean' ||
      !finite(shape.rotation) ||
      !finite(shape.borderWidth) ||
      !finite(shape.shadowBlur)
    )
      throw new Error('Invalid screenshot shape.');
    Object.assign(shape, normalizeShapeLayerStyle(shape));
    identifiers.add(shape.id);
  }
  validateScreenshotComposition(state);
  const background = state.background;
  if (
    background !== null &&
    (!background ||
      !['image', 'color', 'gradient'].includes(background.kind) ||
      (background.kind === 'image' && typeof background.path !== 'string') ||
      (background.kind === 'color' && typeof background.color !== 'string') ||
      (background.kind === 'gradient' &&
        (!Array.isArray(background.gradient?.stops) ||
          background.gradient.stops.length < 2 ||
          background.gradient.stops.length > 32)))
  )
    throw new Error('Invalid screenshot background.');
}

module.exports = { dimensions, validateScreenshotState };
