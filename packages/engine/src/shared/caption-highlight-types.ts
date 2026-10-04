export type CaptionHighlightDisplayMode = 'sentence' | 'word';
export type CaptionHighlightFill = 'solid' | 'gradient';
export type CaptionHighlightEffect = 'none' | 'pop' | 'jump' | 'pulse';
export type CaptionHighlightGradientType = 'linear' | 'radial';

export interface CaptionHighlightGradientStop {
  id: string;
  position: number;
  color: string;
  alpha?: number;
}

export interface CaptionHighlightGradient {
  type?: CaptionHighlightGradientType;
  angle?: number;
  stops: CaptionHighlightGradientStop[];
}

export interface CaptionHighlightStyle {
  enabled: boolean;
  displayMode: CaptionHighlightDisplayMode;
  fill: CaptionHighlightFill;
  color: string;
  gradient: CaptionHighlightGradient;
  effect: CaptionHighlightEffect;
  intensity: number;
  inactiveOpacity: number;
}

export interface CaptionHighlightWordRun {
  text: string;
  active: boolean;
  progress: number;
}

export interface CaptionWordHighlightContent {
  words: CaptionHighlightWordRun[];
}
