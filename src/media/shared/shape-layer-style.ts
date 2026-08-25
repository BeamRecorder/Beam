import type { ShapeLayerFamily, ShapeLayerPreset, ShapeLayerStyle } from './shape-layer-types';

export const SHAPE_PRESETS: readonly ShapeLayerPreset[] = [
  'rectangle',
  'rounded-rectangle',
  'ellipse',
  'triangle',
  'diamond',
  'star',
];
export const ARROW_PRESETS: readonly ShapeLayerPreset[] = ['arrow'];
export const DEFAULT_SHAPE_LAYER_STYLE: ShapeLayerStyle = {
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

const finite = (value: number | undefined, fallback: number, max: number) =>
  Number.isFinite(value) ? Math.min(max, Math.max(0, value!)) : fallback;
const color = (value: string | undefined, fallback: string) =>
  /^#[\da-f]{6}(?:[\da-f]{2})?$/i.test(value ?? '') ? value! : fallback;

export const defaultShapePresetFor = (family: ShapeLayerFamily): ShapeLayerPreset =>
  family === 'arrow' ? 'arrow' : 'rounded-rectangle';

export const normalizeShapeLayerStyle = (value: Partial<ShapeLayerStyle> | null | undefined): ShapeLayerStyle => {
  const family = value?.family === 'arrow' ? 'arrow' : 'shape';
  const presets = family === 'arrow' ? ARROW_PRESETS : SHAPE_PRESETS;
  return {
    family,
    preset: presets.includes(value?.preset as ShapeLayerPreset) ? value!.preset! : defaultShapePresetFor(family),
    fillColor: color(value?.fillColor, DEFAULT_SHAPE_LAYER_STYLE.fillColor),
    borderColor: color(value?.borderColor, DEFAULT_SHAPE_LAYER_STYLE.borderColor),
    borderWidth: finite(value?.borderWidth, DEFAULT_SHAPE_LAYER_STYLE.borderWidth, 40),
    cornerRadius: finite(value?.cornerRadius, DEFAULT_SHAPE_LAYER_STYLE.cornerRadius, 50),
    arrowThickness: finite(value?.arrowThickness, DEFAULT_SHAPE_LAYER_STYLE.arrowThickness, 80),
    arrowHeadSize: finite(value?.arrowHeadSize, DEFAULT_SHAPE_LAYER_STYLE.arrowHeadSize, 70),
    rotation: finite(value?.rotation, DEFAULT_SHAPE_LAYER_STYLE.rotation, 360),
    opacityEnabled: value?.opacityEnabled === true,
    opacity: finite(value?.opacity, DEFAULT_SHAPE_LAYER_STYLE.opacity, 100),
    backdropBlur: finite(value?.backdropBlur, DEFAULT_SHAPE_LAYER_STYLE.backdropBlur, 100),
    shadowEnabled: value?.shadowEnabled === true,
    shadowColor: color(value?.shadowColor, DEFAULT_SHAPE_LAYER_STYLE.shadowColor),
    shadowBlur: finite(value?.shadowBlur, DEFAULT_SHAPE_LAYER_STYLE.shadowBlur, 96),
    shadowDirection: ['all', 'bottom', 'bottom-right', 'top-left'].includes(value?.shadowDirection ?? '')
      ? value!.shadowDirection!
      : DEFAULT_SHAPE_LAYER_STYLE.shadowDirection,
  };
};

export const isShapeLayerStyle = (value: Partial<ShapeLayerStyle>) => {
  const normalized = normalizeShapeLayerStyle(value);
  return (Object.keys(normalized) as Array<keyof ShapeLayerStyle>).every((key) => value[key] === normalized[key]);
};
