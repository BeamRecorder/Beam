const PRESETS = new Set(['rectangle', 'rounded-rectangle', 'ellipse', 'triangle', 'diamond', 'star', 'arrow']);
const DIRECTIONS = new Set(['all', 'bottom', 'bottom-right', 'top-left']);
const SHAPE_PRESETS = new Set(['rectangle', 'rounded-rectangle', 'ellipse', 'triangle', 'diamond', 'star']);
const DEFAULTS = {
  family: 'shape',
  preset: 'rounded-rectangle',
  fillColor: '#ff5a1f',
  borderColor: '#ffffff',
  borderWidth: 0,
  cornerRadius: 16,
  arrowThickness: 36,
  arrowHeadSize: 38,
  rotation: 0,
  opacityEnabled: false,
  opacity: 70,
  backdropBlur: 35,
  shadowEnabled: false,
  shadowColor: '#000000',
  shadowBlur: 32,
  shadowDirection: 'bottom-right',
};

const finite = (value, fallback, max) =>
  typeof value === 'number' && Number.isFinite(value) ? Math.max(0, Math.min(max, value)) : fallback;
const color = (value, fallback) =>
  typeof value === 'string' && /^#[0-9a-f]{6}(?:[0-9a-f]{2})?$/i.test(value) ? value : fallback;

const normalizeShapeLayerStyle = (value) => {
  const family = value?.family === 'arrow' ? 'arrow' : 'shape';
  const preset =
    PRESETS.has(value?.preset) && (family === 'arrow' ? value.preset === 'arrow' : SHAPE_PRESETS.has(value.preset))
      ? value.preset
      : family === 'arrow'
        ? 'arrow'
        : DEFAULTS.preset;
  return {
    family,
    preset,
    fillColor: color(value?.fillColor, DEFAULTS.fillColor),
    borderColor: color(value?.borderColor, DEFAULTS.borderColor),
    borderWidth: finite(value?.borderWidth, DEFAULTS.borderWidth, 40),
    cornerRadius: finite(value?.cornerRadius, DEFAULTS.cornerRadius, 50),
    arrowThickness: finite(value?.arrowThickness, DEFAULTS.arrowThickness, 80),
    arrowHeadSize: finite(value?.arrowHeadSize, DEFAULTS.arrowHeadSize, 70),
    rotation: finite(value?.rotation, DEFAULTS.rotation, 360),
    opacityEnabled: value?.opacityEnabled === true,
    opacity: finite(value?.opacity, DEFAULTS.opacity, 100),
    backdropBlur: finite(value?.backdropBlur, DEFAULTS.backdropBlur, 100),
    shadowEnabled: value?.shadowEnabled === true,
    shadowColor: color(value?.shadowColor, DEFAULTS.shadowColor),
    shadowBlur: finite(value?.shadowBlur, DEFAULTS.shadowBlur, 96),
    shadowDirection: DIRECTIONS.has(value?.shadowDirection) ? value.shadowDirection : DEFAULTS.shadowDirection,
  };
};

module.exports = { normalizeShapeLayerStyle };
