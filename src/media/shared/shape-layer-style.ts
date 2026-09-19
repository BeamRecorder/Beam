import { isElementText } from './element-text';
import { isFreehandDrawing } from './freehand';
import { isColorFill, type ColorFill } from './color-fill-types';
import { SHAPE_CATALOG } from './shape-catalog';
import type { ShapeLayerFamily, ShapeLayerPreset, ShapeLayerStyle } from './shape-layer-types';

export const SHAPE_PRESETS: readonly ShapeLayerPreset[] = SHAPE_CATALOG.map(({ id }) => id);
export const ARROW_PRESETS: readonly ShapeLayerPreset[] = ['arrow'];
export const DEFAULT_SHAPE_LAYER_STYLE: ShapeLayerStyle = {
  family: 'shape',
  preset: 'rounded-rectangle',
  fillEnabled: true,
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

/** New annotation shapes follow the familiar screenshot-tool convention: an outlined, unfilled rectangle. */
export const DEFAULT_ANNOTATION_SHAPE_STYLE: ShapeLayerStyle = {
  ...DEFAULT_SHAPE_LAYER_STYLE,
  preset: 'rectangle',
  fillEnabled: false,
  fillColor: '#ff5a1f',
  borderColor: '#ff5a1f',
  borderWidth: 8,
  cornerRadius: 0,
};

const finite = (value: number | undefined, fallback: number, max: number) =>
  Number.isFinite(value) ? Math.min(max, Math.max(0, value!)) : fallback;
const color = (value: string | undefined, fallback: string) =>
  /^#[\da-f]{6}(?:[\da-f]{2})?$/i.test(value ?? '') ? value! : fallback;

export const defaultShapePresetFor = (family: ShapeLayerFamily): ShapeLayerPreset =>
  family === 'arrow' ? 'arrow' : family === 'text' ? 'text' : family === 'drawing' ? 'freehand' : 'rounded-rectangle';

export const shapeLayerFill = (value: Pick<ShapeLayerStyle, 'fill' | 'fillColor'>): ColorFill =>
  isColorFill(value.fill) ? value.fill : { kind: 'color', color: value.fillColor };

export const normalizeShapeLayerStyle = (
  value: Partial<ShapeLayerStyle> | null | undefined,
): ShapeLayerStyle & { fillEnabled: boolean } => {
  const family = value?.family && ['arrow', 'text', 'drawing'].includes(value.family) ? value.family : 'shape';
  const presets = family === 'shape' ? SHAPE_PRESETS : [defaultShapePresetFor(family)];
  return {
    ...(value?.text ? { text: value.text } : {}),
    ...(value?.drawing ? { drawing: value.drawing } : {}),
    family,
    preset: presets.includes(value?.preset as ShapeLayerPreset) ? value!.preset! : defaultShapePresetFor(family),
    ...(isColorFill(value?.fill) ? { fill: value.fill } : {}),
    fillEnabled: value?.fillEnabled !== false,
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
  if (value.text !== undefined && !isElementText(value.text)) return false;
  if (value.drawing !== undefined && !isFreehandDrawing(value.drawing)) return false;
  if (value.fill !== undefined && !isColorFill(value.fill)) return false;
  if ((value.family === 'text' && !value.text) || (value.family === 'drawing' && !value.drawing)) return false;
  const normalized = normalizeShapeLayerStyle(value);
  return (Object.keys(normalized) as Array<keyof ShapeLayerStyle>).every((key) => value[key] === normalized[key]);
};
