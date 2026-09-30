import type { ExpressionId, EyeStyle, ShapeId, StateId } from '../Beamy/engine/bot-types';

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
