import type { DitheringEffect, DitheringRecipe } from './dithering-effect-types';
export const DEFAULT_DITHERING_RECIPE: DitheringRecipe;
export function validateDitheringRecipe(value: unknown): asserts value is DitheringRecipe;
export function createDitheringEffect(id: string): DitheringEffect;
