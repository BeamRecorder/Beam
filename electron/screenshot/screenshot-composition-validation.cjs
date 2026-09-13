const BLEND_MODES = new Set([
  'source-over',
  'darken',
  'multiply',
  'color-burn',
  'lighten',
  'screen',
  'color-dodge',
  'lighter',
  'overlay',
  'soft-light',
  'hard-light',
  'difference',
  'exclusion',
  'hue',
  'saturation',
  'color',
  'luminosity',
]);
const bounded = (value, min, max) =>
  typeof value === 'number' && Number.isFinite(value) && value >= min && value <= max;
const color = (value) => typeof value === 'string' && /^#[\da-f]{6}(?:[\da-f]{2})?$/i.test(value);
const identifier = (value) => typeof value === 'string' && value.length > 0 && value.length <= 200;

function validateScreenshotComposition(state) {
  const ids = new Set(['__background__', '__watermark__']);
  for (const item of [state.image, ...state.shapes, ...(state.effects ?? []), ...(state.images ?? [])]) {
    if (ids.has(item.id)) throw new Error('Duplicate screenshot layer identifier.');
    ids.add(item.id);
  }
  if (state.cursors !== undefined) {
    if (!Array.isArray(state.cursors) || state.cursors.length + state.shapes.length > 500)
      throw new Error('Invalid screenshot cursor layers.');
    for (const cursor of state.cursors) {
      if (
        !cursor ||
        !identifier(cursor.id) ||
        ids.has(cursor.id) ||
        !identifier(cursor.name) ||
        typeof cursor.enabled !== 'boolean' ||
        !cursor.position ||
        !bounded(cursor.position.x, -10, 10) ||
        !bounded(cursor.position.y, -10, 10) ||
        !bounded(cursor.size, 16, 384) ||
        !bounded(cursor.rotation, 0, 360) ||
        !cursor.selection ||
        cursor.selection.mode !== 'fixed' ||
        !identifier(cursor.selection.packId) ||
        !identifier(cursor.selection.cursorId) ||
        !color(cursor.color) ||
        !color(cursor.shadowColor) ||
        typeof cursor.shadowEnabled !== 'boolean' ||
        !bounded(cursor.shadowBlur, 0, 24) ||
        !['all', 'bottom', 'bottom-right', 'top-left'].includes(cursor.shadowDirection)
      )
        throw new Error('Invalid screenshot cursor.');
      ids.add(cursor.id);
    }
  }
  if (state.composition === undefined) return; // Older documents keep their original paint order on load.
  if (!Array.isArray(state.composition) || state.composition.length !== ids.size)
    throw new Error('Invalid screenshot composition.');
  const seen = new Set();
  for (const layer of state.composition) {
    if (
      !layer ||
      !ids.has(layer.id) ||
      seen.has(layer.id) ||
      !bounded(layer.opacity, 0, 100) ||
      !BLEND_MODES.has(layer.blendMode) ||
      typeof layer.locked !== 'boolean'
    )
      throw new Error('Invalid screenshot compositing settings.');
    seen.add(layer.id);
  }
}
module.exports = { validateScreenshotComposition };
