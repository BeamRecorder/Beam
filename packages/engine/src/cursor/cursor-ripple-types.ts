export type CursorRippleStyle = 'none' | 'single' | 'double' | 'solid' | 'water';

export interface CursorWaterRipple {
  x: number;
  y: number;
  ageSeconds: number;
  spread: number;
  intensity: number;
  durationSeconds: number;
  width: number;
}
