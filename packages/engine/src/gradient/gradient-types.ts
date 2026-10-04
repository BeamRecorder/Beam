import type { LayerBlendMode } from '../shared/layer-compositing-types';
import type { ColorAdjustmentEffect } from './color-effect-types';

export type GradientMode = 'mesh' | 'flow' | 'silk';
export interface GradientRecipe {
  version: 1;
  colors: string[];
  background: string;
  mode: GradientMode;
  grain: number;
  distortion: number;
  softness: number;
  folds: number;
  space: number;
  scale: number;
  rotation: number;
  seed: number;
  offsetX: number;
  offsetY: number;
  stretchX: number;
  stretchY: number;
  noiseFrequency: number;
  octaves: number;
  turbulence: number;
  swirl: number;
  curvature: number;
  colorSpread: number;
  foldFrequency: number;
  lightAngle: number;
  exposure: number;
  contrast: number;
  saturation: number;
  grainSize: number;
  vignette: number;
  drift: number;
  frame: number;
}
export type GradientNumberKey = Exclude<keyof GradientRecipe, 'version' | 'colors' | 'background' | 'mode'>;
export interface GradientLayerEffect {
  id: string;
  kind: 'gradient';
  enabled: boolean;
  opacity: number;
  blendMode: LayerBlendMode;
  recipe: GradientRecipe;
}
export type LayerEffect = GradientLayerEffect | ColorAdjustmentEffect;

export interface GradientPreset {
  id: string;
  name: string;
  recipe: GradientRecipe;
}
