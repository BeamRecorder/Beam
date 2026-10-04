import type { CursorRippleStyle } from '../cursor/cursor-ripple-types';

export type CursorClickButton = 'left' | 'right';
export interface CursorWaterRippleSettings {
  intensity: number;
  spread: number;
  durationMs: number;
  width: number;
}
export interface CursorClickEffectSettings {
  springEnabled: boolean;
  springIntensity: number;
  rippleEnabled: boolean;
  rippleStyle?: CursorRippleStyle;
  rippleSize: number;
  rippleColor: string;
  rippleOpacity?: number;
  rippleWidth?: number;
  rippleDurationMs?: number;
  water?: CursorWaterRippleSettings;
}
export interface CursorClickEffects {
  left: CursorClickEffectSettings;
  right: CursorClickEffectSettings;
}
