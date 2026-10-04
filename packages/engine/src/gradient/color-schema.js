export const DEFAULT_COLOR_RECIPE = {
  version: 1,
  hue: 0,
  saturation: 100,
  brightness: 100,
  contrast: 100,
  grayscale: 0,
  sepia: 0,
  invert: 0,
};
export const COLOR_RANGES = {
  hue: [-180, 180],
  saturation: [0, 200],
  brightness: [0, 200],
  contrast: [0, 200],
  grayscale: [0, 100],
  sepia: [0, 100],
  invert: [0, 100],
};
export function validateColorRecipe(value) {
  if (
    !value ||
    typeof value !== 'object' ||
    Array.isArray(value) ||
    value.version !== 1 ||
    Object.keys(value).some((key) => !Object.hasOwn(DEFAULT_COLOR_RECIPE, key))
  )
    throw new TypeError('Invalid color adjustment recipe.');
  for (const [key, [min, max]] of Object.entries(COLOR_RANGES)) {
    if (typeof value[key] !== 'number' || !Number.isFinite(value[key]) || value[key] < min || value[key] > max)
      throw new TypeError(`Invalid color adjustment: ${key}.`);
  }
}
export function createColorEffect(id, monochrome = false) {
  return {
    id,
    kind: 'color-adjustment',
    enabled: true,
    opacity: 100,
    blendMode: 'source-over',
    recipe: { ...DEFAULT_COLOR_RECIPE, grayscale: monochrome ? 100 : 0 },
  };
}
