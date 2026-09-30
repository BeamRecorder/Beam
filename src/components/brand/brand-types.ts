export type BrandJingle =
  | 'decode'
  | 'pixel'
  | 'glitch'
  | 'scan'
  | 'crash'
  | 'burst'
  | 'echo'
  | 'matrix'
  | 'spark'
  | 'shuffle'
  | 'type'
  | 'shimmer';
export interface BrandLetterFrame {
  text: string;
  opacity: number;
  blur: number;
  contrast: number;
  shadowX: number;
  reveal: number;
}
