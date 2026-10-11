export const ARTISTIC_DEFAULTS = {
  ascii: {
    version: 1,
    cellSize: 8,
    brightness: 100,
    contrast: 100,
    colored: true,
    invert: false,
    foreground: '#ffffff',
    background: '#000000',
  },
  grain: { version: 1, amount: 25, size: 1, monochrome: true, seed: 1 },
  cyanotype: { version: 1, exposure: 0, contrast: 110, blue: '#123b6d', paper: '#f4eedf' },
};
export const ARTISTIC_RANGES = {
  ascii: { cellSize: [4, 32], brightness: [0, 200], contrast: [0, 200] },
  grain: { amount: [0, 100], size: [0.5, 8], seed: [0, 10000] },
  cyanotype: { exposure: [-100, 100], contrast: [0, 200] },
};
export function validateArtisticRecipe(kind, value) {
  const defaults = Object.hasOwn(ARTISTIC_DEFAULTS, kind) ? ARTISTIC_DEFAULTS[kind] : undefined;
  if (
    !defaults ||
    !value ||
    typeof value !== 'object' ||
    Array.isArray(value) ||
    value.version !== 1 ||
    Object.keys(value).some((key) => !Object.hasOwn(defaults, key))
  )
    throw new TypeError('Invalid artistic effect recipe.');
  for (const [key, initial] of Object.entries(defaults)) {
    if (key === 'version') continue;
    const range = ARTISTIC_RANGES[kind][key];
    if (
      typeof value[key] !== typeof initial ||
      (typeof initial === 'number' &&
        (!Number.isFinite(value[key]) ||
          value[key] < range[0] ||
          value[key] > range[1] ||
          (key === 'seed' && !Number.isInteger(value[key])))) ||
      (typeof initial === 'string' && !/^#(?:[\da-f]{3}|[\da-f]{6})$/i.test(value[key]))
    )
      throw new TypeError(`Invalid ${kind} parameter: ${key}.`);
  }
}
export function createArtisticEffect(kind, id) {
  if (!Object.hasOwn(ARTISTIC_DEFAULTS, kind)) throw new TypeError('Unknown artistic effect.');
  return { id, kind, enabled: true, opacity: 100, blendMode: 'source-over', recipe: { ...ARTISTIC_DEFAULTS[kind] } };
}
