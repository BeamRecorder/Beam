export type CursorClickButton = 'left' | 'right';

export type CursorMotionPreset = 'focused' | 'smooth' | 'custom';

export interface CursorMotionSettings {
  preset: CursorMotionPreset;
  smoothing: number;
  springMassMultiplier: number;
  motionBlur: number;
}

const isRecord = (value: unknown): value is Record<string, unknown> => Boolean(value) && typeof value === 'object';
const finiteNumber = (value: unknown, fallback: number) =>
  typeof value === 'number' && Number.isFinite(value) ? value : fallback;
const booleanValue = (value: unknown, fallback: boolean) => (typeof value === 'boolean' ? value : fallback);
const stringValue = (value: unknown, fallback: string) => (typeof value === 'string' && value ? value : fallback);
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
};

const SMOOTH_MOTION: Omit<CursorMotionSettings, 'preset'> = {
  smoothing: 0.67,
  springMassMultiplier: 1.29,
  motionBlur: 0.4,
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
  };
};

export type CursorRippleStyle = 'none' | 'single' | 'double' | 'solid';

export interface CursorClickEffectSettings {
  springEnabled: boolean;
  springIntensity: number;
  rippleEnabled: boolean;
  rippleStyle?: CursorRippleStyle;
  rippleSize: number;
  rippleColor: string;
}

export interface CursorClickEffects {
  left: CursorClickEffectSettings;
  right: CursorClickEffectSettings;
}

const DEFAULT_LEFT: CursorClickEffectSettings = {
  springEnabled: true,
  springIntensity: 50,
  rippleEnabled: false,
  rippleStyle: 'single',
  rippleSize: 30,
  rippleColor: '#ff5a1f',
};

const DEFAULT_RIGHT: CursorClickEffectSettings = {
  springEnabled: true,
  springIntensity: 50,
  rippleEnabled: false,
  rippleStyle: 'single',
  rippleSize: 30,
  rippleColor: '#6366f1',
};

export const createDefaultCursorClickEffects = (): CursorClickEffects => ({
  left: { ...DEFAULT_LEFT },
  right: { ...DEFAULT_RIGHT },
});

const normalizeEffect = (value: unknown, fallback: CursorClickEffectSettings): CursorClickEffectSettings => {
  const input = isRecord(value) ? value : {};
  const rawStyle = typeof input.rippleStyle === 'string' ? input.rippleStyle : undefined;
  const rippleStyle: CursorRippleStyle =
    rawStyle === 'none' || rawStyle === 'single' || rawStyle === 'double' || rawStyle === 'solid'
      ? rawStyle
      : (fallback.rippleStyle ?? (booleanValue(input.rippleEnabled, fallback.rippleEnabled) ? 'single' : 'none'));
  const rippleEnabled = booleanValue(input.rippleEnabled, fallback.rippleEnabled);

  return {
    springEnabled: booleanValue(input.springEnabled, fallback.springEnabled),
    springIntensity: Math.min(100, Math.max(0, finiteNumber(input.springIntensity, fallback.springIntensity))),
    rippleEnabled,
    rippleStyle,
    rippleSize: Math.min(80, Math.max(10, finiteNumber(input.rippleSize, fallback.rippleSize))),
    rippleColor: stringValue(input.rippleColor, fallback.rippleColor),
  };
};

export const normalizeCursorClickEffects = (value: unknown): CursorClickEffects => {
  const input = isRecord(value) ? value : {};
  const left = normalizeEffect(input.left, DEFAULT_LEFT);
  const right = normalizeEffect(input.right, DEFAULT_RIGHT);
  const sharedStyle =
    [left.rippleStyle, right.rippleStyle].find(
      (style): style is Exclude<CursorRippleStyle, 'none'> =>
        style === 'single' || style === 'double' || style === 'solid',
    ) ?? 'single';
  return {
    left: { ...left, rippleStyle: sharedStyle },
    right: { ...right, rippleStyle: sharedStyle },
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
