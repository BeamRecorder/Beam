import type { GradientRecipe, GradientNumberKey, LayerEffect } from './gradient-types';
import type { LayerBlendMode } from '../shared/layer-compositing-types';
export const DEFAULT_GRADIENT_RECIPE: GradientRecipe;
export const GRADIENT_RANGES: Record<GradientNumberKey, readonly [number, number]>;
export function validateGradientRecipe(value: unknown): asserts value is GradientRecipe;
export function validateLayerEffects(
  value: unknown,
  blendModes: readonly LayerBlendMode[],
): asserts value is LayerEffect[];
