import type { ColorLayerStyle } from './color-layer-style-types';

export const DEFAULT_COLOR_LAYER_STYLE: ColorLayerStyle = {
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

const percent = (value: number | undefined, fallback: number) =>
  Number.isFinite(value) ? Math.min(100, Math.max(0, value!)) : fallback;
const boundedNumber = (value: number | undefined, fallback: number, max: number) =>
  Number.isFinite(value) ? Math.min(max, Math.max(0, value!)) : fallback;

export const normalizeColorLayerStyle = (value: Partial<ColorLayerStyle> | null | undefined): ColorLayerStyle => ({
  opacityEnabled: value?.opacityEnabled === true,
  opacity: percent(value?.opacity, DEFAULT_COLOR_LAYER_STYLE.opacity),
  cornerRadius:
    typeof value?.cornerRadius === 'number'
      ? Number.isFinite(value.cornerRadius)
        ? Math.min(200, Math.max(0, value.cornerRadius))
        : DEFAULT_COLOR_LAYER_STYLE.cornerRadius
      : ['none', 'sm', 'md', 'lg'].includes(value?.cornerRadius ?? '')
        ? value!.cornerRadius!
        : DEFAULT_COLOR_LAYER_STYLE.cornerRadius,
  shadowSize: ['none', 'sm', 'md', 'lg', 'custom'].includes(value?.shadowSize ?? '')
    ? value!.shadowSize!
    : DEFAULT_COLOR_LAYER_STYLE.shadowSize,
  shadowBlur: boundedNumber(value?.shadowBlur, DEFAULT_COLOR_LAYER_STYLE.shadowBlur, 96),
  shadowMode: value?.shadowMode === 'adaptive' ? 'adaptive' : 'solid',
  shadowColor: /^#[\da-f]{6}(?:[\da-f]{2})?$/i.test(value?.shadowColor ?? '')
    ? value!.shadowColor!
    : DEFAULT_COLOR_LAYER_STYLE.shadowColor,
  shadowDirection: ['all', 'bottom', 'bottom-right', 'top-left'].includes(value?.shadowDirection ?? '')
    ? value!.shadowDirection!
    : DEFAULT_COLOR_LAYER_STYLE.shadowDirection,
  backdropBlurEnabled: value?.backdropBlurEnabled === true,
  backdropBlur: percent(value?.backdropBlur, DEFAULT_COLOR_LAYER_STYLE.backdropBlur),
});

const optionalPercent = (value: number | undefined, max = 100) =>
  value === undefined || (Number.isFinite(value) && value >= 0 && value <= max);

export const isColorLayerStyle = (value: Partial<ColorLayerStyle>) =>
  (value.opacityEnabled === undefined || typeof value.opacityEnabled === 'boolean') &&
  optionalPercent(value.opacity) &&
  (value.cornerRadius === undefined ||
    (typeof value.cornerRadius === 'number'
      ? optionalPercent(value.cornerRadius, 200)
      : ['none', 'sm', 'md', 'lg'].includes(value.cornerRadius))) &&
  (value.shadowSize === undefined || ['none', 'sm', 'md', 'lg', 'custom'].includes(value.shadowSize)) &&
  optionalPercent(value.shadowBlur, 96) &&
  (value.shadowMode === undefined || ['solid', 'adaptive'].includes(value.shadowMode)) &&
  (value.shadowColor === undefined || /^#[\da-f]{6}(?:[\da-f]{2})?$/i.test(value.shadowColor)) &&
  (value.shadowDirection === undefined ||
    ['all', 'bottom', 'bottom-right', 'top-left'].includes(value.shadowDirection)) &&
  (value.backdropBlurEnabled === undefined || typeof value.backdropBlurEnabled === 'boolean') &&
  optionalPercent(value.backdropBlur);
