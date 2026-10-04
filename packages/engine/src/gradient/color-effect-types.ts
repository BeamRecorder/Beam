export interface ColorAdjustmentRecipe {
  version: 1;
  hue: number;
  saturation: number;
  brightness: number;
  contrast: number;
  grayscale: number;
  sepia: number;
  invert: number;
}
export type ColorAdjustmentKey = Exclude<keyof ColorAdjustmentRecipe, 'version'>;
export interface ColorAdjustmentEffect {
  id: string;
  kind: 'color-adjustment';
  enabled: boolean;
  opacity: number;
  blendMode: 'source-over';
  recipe: ColorAdjustmentRecipe;
}
export type LayerEffectAddKind = 'gradient' | 'color-adjustment' | 'grayscale';
