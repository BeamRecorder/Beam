import type { ColorAdjustmentEffect, ColorAdjustmentKey, ColorAdjustmentRecipe } from './color-effect-types';
export const DEFAULT_COLOR_RECIPE: ColorAdjustmentRecipe;
export const COLOR_RANGES: Record<ColorAdjustmentKey, readonly [number, number]>;
export function validateColorRecipe(value: unknown): asserts value is ColorAdjustmentRecipe;
export function createColorEffect(id: string, monochrome?: boolean): ColorAdjustmentEffect;
