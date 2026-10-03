// Portable validation shared by the engine protocol and desktop project storage.
export const GLASS_MAX_POINTS = 128;
export const DEFAULT_GLASS_HIGHLIGHT = Object.freeze({
  shape: 'circle',
  size: 0.6,
  path: Object.freeze([]),
  refraction: 0.18,
  bevel: 0.12,
  rim: 0.28,
  dispersion: 0.025,
  shadow: 0.15,
  opacity: 1,
  transitionMs: 250,
});

const inRange = (value, min, max) => Number.isFinite(value) && value >= min && value <= max;

export function validateGlassHighlight(zoom) {
  if (zoom.effect !== undefined && !['camera', 'glass'].includes(zoom.effect))
    throw new TypeError('Invalid zoom effect.');
  if (zoom.generation !== undefined && zoom.generation !== 'automatic')
    throw new TypeError('Invalid zoom generation origin.');
  const value = zoom.glass;
  if (value !== undefined) {
    if (
      !value ||
      !['circle', 'freehand'].includes(value.shape) ||
      !inRange(value.size, 0.02, 4) ||
      !Array.isArray(value.path) ||
      value.path.length > GLASS_MAX_POINTS ||
      (value.path.length > 0 && value.path.length < 3) ||
      value.path.some((point) => !point || !inRange(point.x, -1, 1) || !inRange(point.y, -1, 1)) ||
      !['refraction', 'rim', 'dispersion', 'shadow', 'opacity'].every((key) => inRange(value[key], 0, 1)) ||
      !inRange(value.bevel, 0.02, 0.5) ||
      !inRange(value.transitionMs, 0, 1000)
    )
      throw new TypeError('Invalid glass highlight settings.');
  }
  if (
    zoom.effect === 'glass' &&
    (!value || zoom.mode !== 'manual' || !inRange(zoom.focus?.cx, 0, 1) || !inRange(zoom.focus?.cy, 0, 1))
  )
    throw new TypeError('Glass highlights require manual canvas coordinates and settings.');
}
