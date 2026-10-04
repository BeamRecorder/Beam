import { validateColorRecipe } from './color-schema.js';
// Portable, static recipes use the BEBE-ui parameter contract. No wall-clock state is persisted.
export const DEFAULT_GRADIENT_RECIPE = {
  version: 1,
  colors: ['#2457ff', '#6445ff', '#87adff', '#d7e9ff'],
  background: '#f4f7ff',
  mode: 'flow',
  grain: 24,
  distortion: 55,
  softness: 35,
  folds: 35,
  space: 55,
  scale: 1,
  rotation: -25,
  seed: 12,
  offsetX: 0,
  offsetY: 0,
  stretchX: 100,
  stretchY: 100,
  noiseFrequency: 1,
  octaves: 3,
  turbulence: 55,
  swirl: 0,
  curvature: 34,
  colorSpread: 50,
  foldFrequency: 5,
  lightAngle: 0,
  exposure: 0,
  contrast: 100,
  saturation: 100,
  grainSize: 1,
  vignette: 0,
  drift: 20,
  frame: 0,
};
/** Ranges are shared with the editor and normalization, so every control
 * has a real GPU counterpart. Values are percentages unless documented. */
export const GRADIENT_RANGES = {
  grain: [0, 100],
  distortion: [0, 100],
  softness: [0, 100],
  folds: [0, 100],
  space: [0, 100],
  scale: [0.25, 4],
  rotation: [-180, 180],
  seed: [0, 10000],
  offsetX: [-100, 100],
  offsetY: [-100, 100],
  stretchX: [25, 250],
  stretchY: [25, 250],
  noiseFrequency: [0.25, 4],
  octaves: [1, 5],
  turbulence: [0, 100],
  swirl: [-100, 100],
  curvature: [0, 100],
  colorSpread: [0, 100],
  foldFrequency: [1, 12],
  lightAngle: [0, 360],
  exposure: [-40, 40],
  contrast: [50, 150],
  saturation: [0, 200],
  grainSize: [0.5, 4],
  vignette: [0, 100],
  drift: [0, 100],
  frame: [0, 120],
};

const hex = (value) => typeof value === 'string' && /^#(?:[\da-f]{3}|[\da-f]{6})$/i.test(value);
const object = (value) => value && typeof value === 'object' && !Array.isArray(value);
export function validateGradientRecipe(value) {
  if (
    !object(value) ||
    value.version !== 1 ||
    !['mesh', 'flow', 'silk'].includes(value.mode) ||
    !Array.isArray(value.colors) ||
    value.colors.length < 2 ||
    value.colors.length > 8 ||
    !value.colors.every(hex) ||
    !hex(value.background) ||
    Object.keys(value).some((key) => !Object.hasOwn(DEFAULT_GRADIENT_RECIPE, key))
  )
    throw new TypeError('Invalid gradient recipe.');
  for (const [key, [min, max]] of Object.entries(GRADIENT_RANGES)) {
    if (
      typeof value[key] !== 'number' ||
      !Number.isFinite(value[key]) ||
      value[key] < min ||
      value[key] > max ||
      (['seed', 'octaves'].includes(key) && !Number.isInteger(value[key]))
    )
      throw new TypeError(`Invalid gradient parameter: ${key}.`);
  }
}
export function validateLayerEffects(effects, blendModes) {
  if (!Array.isArray(effects) || effects.length > 4) throw new TypeError('A layer supports up to four effects.');
  const ids = new Set();
  for (const effect of effects) {
    if (
      !object(effect) ||
      typeof effect.id !== 'string' ||
      !effect.id ||
      effect.id.length > 200 ||
      ids.has(effect.id) ||
      !['gradient', 'color-adjustment'].includes(effect.kind) ||
      typeof effect.enabled !== 'boolean' ||
      typeof effect.opacity !== 'number' ||
      !Number.isFinite(effect.opacity) ||
      effect.opacity < 0 ||
      effect.opacity > 100 ||
      !blendModes.includes(effect.blendMode) ||
      (effect.kind === 'color-adjustment' && effect.blendMode !== 'source-over') ||
      Object.keys(effect).some((key) => !['id', 'kind', 'enabled', 'opacity', 'blendMode', 'recipe'].includes(key))
    )
      throw new TypeError('Invalid layer effect.');
    if (effect.kind === 'gradient') validateGradientRecipe(effect.recipe);
    else validateColorRecipe(effect.recipe);
    ids.add(effect.id);
  }
}
