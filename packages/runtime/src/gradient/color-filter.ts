import type { ColorAdjustmentRecipe } from '@beam/engine/gradient/color-effect-types';
/** Fixed order matches the serialized recipe and every preview/export path. Alpha is unchanged. */
export function colorAdjustmentFilter(recipe: ColorAdjustmentRecipe): string {
  return `hue-rotate(${recipe.hue}deg) saturate(${recipe.saturation}%) brightness(${recipe.brightness}%) contrast(${recipe.contrast}%) grayscale(${recipe.grayscale}%) sepia(${recipe.sepia}%) invert(${recipe.invert}%)`;
}
