const finite = (value) => typeof value === 'number' && Number.isFinite(value);
const defaults = {
  opacityEnabled: false,
  opacity: 70,
  cornerRadius: 'none',
  shadowSize: 'none',
  shadowBlur: 40,
  shadowMode: 'solid',
  shadowColor: '#000000',
  shadowDirection: 'all',
  backdropBlurEnabled: false,
  backdropBlur: 35,
};
const keys = Object.keys(defaults);
const percent = (value, max = 100) => finite(value) && value >= 0 && value <= max;

const normalizeColorLayerStyle = (value) => {
  if (!keys.some((key) => value?.[key] !== undefined)) return {};
  const radius = value.cornerRadius;
  if (
    (value.opacityEnabled !== undefined && typeof value.opacityEnabled !== 'boolean') ||
    (value.opacity !== undefined && !percent(value.opacity)) ||
    (radius !== undefined &&
      !(typeof radius === 'number' ? percent(radius, 200) : ['none', 'sm', 'md', 'lg'].includes(radius))) ||
    (value.shadowSize !== undefined && !['none', 'sm', 'md', 'lg', 'custom'].includes(value.shadowSize)) ||
    (value.shadowBlur !== undefined && !percent(value.shadowBlur, 96)) ||
    (value.shadowMode !== undefined && !['solid', 'adaptive'].includes(value.shadowMode)) ||
    (value.shadowColor !== undefined && !/^#[\da-f]{6}(?:[\da-f]{2})?$/i.test(value.shadowColor)) ||
    (value.shadowDirection !== undefined &&
      !['all', 'bottom', 'bottom-right', 'top-left'].includes(value.shadowDirection)) ||
    (value.backdropBlurEnabled !== undefined && typeof value.backdropBlurEnabled !== 'boolean') ||
    (value.backdropBlur !== undefined && !percent(value.backdropBlur))
  )
    throw new Error('Apparence de calque couleur invalide');
  return Object.fromEntries(keys.map((key) => [key, value[key] ?? defaults[key]]));
};

module.exports = { normalizeColorLayerStyle };
