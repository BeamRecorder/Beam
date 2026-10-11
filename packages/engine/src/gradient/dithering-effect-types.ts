export interface DitheringRecipe {
  version: 1;
  colors: string[];
  algorithm: 'bayer' | 'jarvis-judice-ninke';
  mapping: 'color' | 'luminance';
  blockSize: number;
  brightness: number;
  contrast: number;
  matrixSize: 2 | 4 | 8;
  pixelSize: number;
}
export interface DitheringEffect {
  id: string;
  kind: 'dithering';
  enabled: boolean;
  opacity: number;
  blendMode: 'source-over';
  recipe: DitheringRecipe;
}
