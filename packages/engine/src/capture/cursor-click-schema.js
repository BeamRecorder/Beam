export const CURSOR_CLICK_LIMITS = {
  rippleSize: { min: 1, max: 80 },
  rippleOpacity: { min: 0, max: 100 },
  rippleWidth: { min: 0.5, max: 8 },
  rippleDurationMs: { min: 150, max: 1500 },
  intensity: { min: 0, max: 100 },
  spread: { min: 1, max: 60 },
  durationMs: { min: 400, max: 2400 },
  width: { min: 1, max: 12 },
};
export const DEFAULT_CURSOR_WATER_RIPPLE = { intensity: 25, spread: 18, durationMs: 900, width: 4 };
export const CURSOR_RING_DEFAULTS = { rippleSize: 22, rippleOpacity: 65, rippleWidth: 2, rippleDurationMs: 500 };
const record = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);
const finite = (value) => typeof value === 'number' && Number.isFinite(value);
const bounded = (value, fallback, limits) =>
  Math.min(limits.max, Math.max(limits.min, finite(value) ? value : fallback));

export function normalizeCursorWaterRipple(value) {
  const input = record(value) ? value : {};
  return Object.fromEntries(
    Object.entries(DEFAULT_CURSOR_WATER_RIPPLE).map(([key, fallback]) => [
      key,
      bounded(input[key], fallback, CURSOR_CLICK_LIMITS[key]),
    ]),
  );
}
export function createDefaultCursorClickEffects() {
  const effect = (color) => ({
    springEnabled: true,
    springIntensity: 35,
    rippleEnabled: false,
    rippleStyle: 'single',
    ...CURSOR_RING_DEFAULTS,
    rippleColor: color,
    water: { ...DEFAULT_CURSOR_WATER_RIPPLE },
  });
  return { left: effect('#ff5a1f'), right: effect('#6366f1') };
}
export function normalizeCursorClickEffect(value, fallback) {
  const input = record(value) ? value : {};
  const rippleStyle = ['none', 'single', 'double', 'solid', 'water'].includes(input.rippleStyle)
    ? input.rippleStyle
    : fallback.rippleStyle;
  return {
    springEnabled: typeof input.springEnabled === 'boolean' ? input.springEnabled : fallback.springEnabled,
    springIntensity: bounded(input.springIntensity, fallback.springIntensity, CURSOR_CLICK_LIMITS.intensity),
    rippleEnabled: typeof input.rippleEnabled === 'boolean' ? input.rippleEnabled : fallback.rippleEnabled,
    rippleStyle,
    rippleColor: typeof input.rippleColor === 'string' && input.rippleColor ? input.rippleColor : fallback.rippleColor,
    ...Object.fromEntries(
      Object.entries(CURSOR_RING_DEFAULTS).map(([key, defaultValue]) => [
        key,
        bounded(input[key], fallback[key] ?? defaultValue, CURSOR_CLICK_LIMITS[key]),
      ]),
    ),
    water: normalizeCursorWaterRipple(input.water),
  };
}
/** Strict saved-document boundary; optional fields are defaulted for older documents. */
export function validateCursorClickEffect(value) {
  if (
    !record(value) ||
    typeof value.springEnabled !== 'boolean' ||
    !finite(value.springIntensity) ||
    typeof value.rippleEnabled !== 'boolean' ||
    !finite(value.rippleSize) ||
    typeof value.rippleColor !== 'string' ||
    !value.rippleColor ||
    Object.keys(CURSOR_RING_DEFAULTS).some((key) => value[key] !== undefined && !finite(value[key])) ||
    (value.water !== undefined &&
      (!record(value.water) || Object.keys(DEFAULT_CURSOR_WATER_RIPPLE).some((key) => !finite(value.water[key]))))
  )
    throw new Error('Invalid cursor click effect');
}
