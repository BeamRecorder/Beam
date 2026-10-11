export const DEFAULT_DITHERING_RECIPE = {
  version: 1,
  algorithm: 'bayer',
  mapping: 'color',
  blockSize: 1,
  brightness: 100,
  contrast: 100,
  colors: ['#000000', '#ffffff'],
  matrixSize: 4,
  pixelSize: 1,
};
export function validateDitheringRecipe(value) {
  if (
    !value ||
    typeof value !== 'object' ||
    Array.isArray(value) ||
    value.version !== 1 ||
    !['bayer', 'jarvis-judice-ninke'].includes(value.algorithm) ||
    !['color', 'luminance'].includes(value.mapping) ||
    ![value.blockSize, value.brightness, value.contrast].every((n) => typeof n === 'number' && Number.isFinite(n)) ||
    value.blockSize < 1 ||
    value.blockSize > 16 ||
    !Number.isInteger(value.blockSize) ||
    value.brightness < 0 ||
    value.brightness > 200 ||
    value.contrast < 0 ||
    value.contrast > 200 ||
    ![2, 4, 8].includes(value.matrixSize) ||
    typeof value.pixelSize !== 'number' ||
    !Number.isFinite(value.pixelSize) ||
    value.pixelSize < 1 ||
    value.pixelSize > 16 ||
    !Array.isArray(value.colors) ||
    value.colors.length < 2 ||
    value.colors.length > 8 ||
    !value.colors.every((color) => typeof color === 'string' && /^#(?:[\da-f]{3}|[\da-f]{6})$/i.test(color)) ||
    Object.keys(value).some((key) => !Object.hasOwn(DEFAULT_DITHERING_RECIPE, key))
  )
    throw new TypeError('Invalid dithering recipe.');
}
export function createDitheringEffect(id) {
  return {
    id,
    kind: 'dithering',
    enabled: true,
    opacity: 100,
    blendMode: 'source-over',
    recipe: { ...DEFAULT_DITHERING_RECIPE, colors: [...DEFAULT_DITHERING_RECIPE.colors] },
  };
}
