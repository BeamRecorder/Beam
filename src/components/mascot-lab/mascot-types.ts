import type { ExpressionId, ShapeId, StateId } from './bot/bot-types';

export type EyeStyle = 'sparkle' | 'star' | 'capsule';
export type PreviewSurface = 'paper' | 'dark' | 'transparent';

export interface MascotLook {
  shape: ShapeId;
  color: string;
  expression: ExpressionId;
  eyes: EyeStyle;
  blush: boolean;
}

export interface MascotStep {
  state: StateId;
  duration: number;
}

export interface MascotPreset {
  version: 1;
  look: MascotLook;
  timeline: MascotStep[];
}
