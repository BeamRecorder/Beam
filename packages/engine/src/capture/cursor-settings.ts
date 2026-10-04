import { createDefaultCursorClickEffects, normalizeCursorClickEffect } from './cursor-click-schema.js';
import type { CursorClickButton, CursorClickEffects } from './cursor-click-types';
export type {
  CursorClickButton,
  CursorClickEffectSettings,
  CursorClickEffects,
  CursorWaterRippleSettings,
} from './cursor-click-types';
export { createDefaultCursorClickEffects } from './cursor-click-schema.js';
export type { CursorRippleStyle } from '../cursor/cursor-ripple-types';

export type CursorMotionPreset = 'focused' | 'smooth' | 'custom';

export interface CursorMotionSettings {
  preset: CursorMotionPreset;
  smoothing: number;
  springMassMultiplier: number;
  motionBlur: number;
  stopSpringEnabled: boolean;
  stopSpringStrength: number;
}

const isRecord = (value: unknown): value is Record<string, unknown> => Boolean(value) && typeof value === 'object';
const finiteNumber = (value: unknown, fallback: number) =>
  typeof value === 'number' && Number.isFinite(value) ? value : fallback;
const booleanValue = (value: unknown, fallback: boolean) => (typeof value === 'boolean' ? value : fallback);
const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

export const CURSOR_AUTO_HIDE_DELAY_DEFAULT = 2;
export const CURSOR_AUTO_HIDE_DELAY_MIN = 0.5;
export const CURSOR_AUTO_HIDE_DELAY_MAX = 10;
export const CURSOR_AUTO_HIDE_FADE_DURATION_DEFAULT = 250;
export const CURSOR_AUTO_HIDE_FADE_DURATION_MIN = 0;
export const CURSOR_AUTO_HIDE_FADE_DURATION_MAX = 1_000;

export interface CursorAutoHideSettings {
  enabled: boolean;
  delaySeconds: number;
  fadeDurationMs: number;
}

export const createDefaultCursorAutoHideSettings = (): CursorAutoHideSettings => ({
  enabled: false,
  delaySeconds: CURSOR_AUTO_HIDE_DELAY_DEFAULT,
  fadeDurationMs: CURSOR_AUTO_HIDE_FADE_DURATION_DEFAULT,
});

export const normalizeCursorAutoHideSettings = (value: unknown): CursorAutoHideSettings => {
  const input = isRecord(value) ? value : {};
  return {
    enabled: booleanValue(input.enabled, false),
    delaySeconds: clamp(
      finiteNumber(input.delaySeconds, CURSOR_AUTO_HIDE_DELAY_DEFAULT),
      CURSOR_AUTO_HIDE_DELAY_MIN,
      CURSOR_AUTO_HIDE_DELAY_MAX,
    ),
    fadeDurationMs: clamp(
      finiteNumber(input.fadeDurationMs, CURSOR_AUTO_HIDE_FADE_DURATION_DEFAULT),
      CURSOR_AUTO_HIDE_FADE_DURATION_MIN,
      CURSOR_AUTO_HIDE_FADE_DURATION_MAX,
    ),
  };
};

const FOCUSED_MOTION: Omit<CursorMotionSettings, 'preset'> = {
  smoothing: 0.67,
  springMassMultiplier: 1,
  motionBlur: 0.25,
  stopSpringEnabled: true,
  stopSpringStrength: 0.3,
};

const SMOOTH_MOTION: Omit<CursorMotionSettings, 'preset'> = {
  smoothing: 0.67,
  springMassMultiplier: 1.29,
  motionBlur: 0.4,
  stopSpringEnabled: true,
  stopSpringStrength: 0.45,
};

export const createDefaultCursorMotionSettings = (): CursorMotionSettings => ({
  preset: 'smooth',
  ...SMOOTH_MOTION,
});

export const cursorMotionPreset = (preset: Exclude<CursorMotionPreset, 'custom'>): CursorMotionSettings => ({
  preset,
  ...(preset === 'focused' ? FOCUSED_MOTION : SMOOTH_MOTION),
});

export const normalizeCursorMotionSettings = (value: unknown): CursorMotionSettings => {
  const input = isRecord(value) ? value : {};
  const fallback = createDefaultCursorMotionSettings();
  const preset =
    input.preset === 'focused' || input.preset === 'smooth' || input.preset === 'custom'
      ? input.preset
      : fallback.preset;
  return {
    preset,
    smoothing: clamp(finiteNumber(input.smoothing, fallback.smoothing), 0, 1),
    springMassMultiplier: clamp(finiteNumber(input.springMassMultiplier, fallback.springMassMultiplier), 0.5, 2),
    motionBlur: clamp(finiteNumber(input.motionBlur, fallback.motionBlur), 0, 1),
    stopSpringEnabled: booleanValue(input.stopSpringEnabled, fallback.stopSpringEnabled),
    stopSpringStrength: clamp(finiteNumber(input.stopSpringStrength, fallback.stopSpringStrength), 0, 1),
  };
};

export const normalizeCursorClickEffects = (value: unknown): CursorClickEffects => {
  const input = isRecord(value) ? value : {};
  const defaults = createDefaultCursorClickEffects();
  return {
    left: normalizeCursorClickEffect(input.left, defaults.left),
    right: normalizeCursorClickEffect(input.right, defaults.right),
  };
};

export const clickButtonForRecordedButton = (button: number): 'left' | 'right' | 'middle' | null => {
  if (button === 1) return 'left';
  if (button === 2) return 'right';
  if (button === 3) return 'middle';
  return null;
};

/** Middle-click keeps the historical left-click visual treatment. */
export const effectButtonForRecordedButton = (button: number): CursorClickButton | null => {
  const recordedButton = clickButtonForRecordedButton(button);
  if (recordedButton === 'right') return 'right';
  if (recordedButton === 'left' || recordedButton === 'middle') return 'left';
  return null;
};
