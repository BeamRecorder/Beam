export interface AsciiRecipe {
  version: 1;
  cellSize: number;
  brightness: number;
  contrast: number;
  colored: boolean;
  invert: boolean;
  foreground: string;
  background: string;
}
export interface GrainRecipe {
  version: 1;
  amount: number;
  size: number;
  monochrome: boolean;
  seed: number;
}
export interface CyanotypeRecipe {
  version: 1;
  exposure: number;
  contrast: number;
  blue: string;
  paper: string;
}
export interface ArtisticRecipeMap {
  ascii: AsciiRecipe;
  grain: GrainRecipe;
  cyanotype: CyanotypeRecipe;
}
export type ArtisticKind = keyof ArtisticRecipeMap;
export type ArtisticEffect = {
  [K in ArtisticKind]: {
    id: string;
    kind: K;
    enabled: boolean;
    opacity: number;
    blendMode: 'source-over';
    recipe: ArtisticRecipeMap[K];
  };
}[ArtisticKind];
