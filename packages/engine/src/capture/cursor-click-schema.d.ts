import type { CursorClickEffectSettings, CursorClickEffects, CursorWaterRippleSettings } from './cursor-click-types';
export const CURSOR_CLICK_LIMITS: Record<
  'rippleSize' | 'rippleOpacity' | 'rippleWidth' | 'rippleDurationMs' | keyof CursorWaterRippleSettings,
  { readonly min: number; readonly max: number }
>;
export const DEFAULT_CURSOR_WATER_RIPPLE: Readonly<CursorWaterRippleSettings>;
export const CURSOR_RING_DEFAULTS: Required<
  Pick<CursorClickEffectSettings, 'rippleSize' | 'rippleOpacity' | 'rippleWidth' | 'rippleDurationMs'>
>;
export function normalizeCursorWaterRipple(value: unknown): CursorWaterRippleSettings;
export function createDefaultCursorClickEffects(): CursorClickEffects;
export function normalizeCursorClickEffect(
  value: unknown,
  fallback: CursorClickEffectSettings,
): CursorClickEffectSettings;
export function validateCursorClickEffect(value: unknown): asserts value is CursorClickEffectSettings;
