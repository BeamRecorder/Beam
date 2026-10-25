export type TransitionEffectKind =
  | 'fade-black'
  | 'fade-white'
  | 'cross-zoom'
  | 'zoom-bounce'
  | 'split'
  | 'push-panels'
  | 'sliding-panels'
  | 'circle-reveal'
  | 'diamond-wipe'
  | 'linear-wipe'
  | 'gradient-wipe'
  | 'whip-pan'
  | 'push'
  | 'camera-shake'
  | 'rgb-split'
  | 'digital-glitch'
  | 'pixel-blocks';

export type GpuTransitionPreset =
  | { kind: TransitionEffectKind }
  | { kind: 'dip-color' | 'color-fade' | 'color-flash'; color: string };

export interface TransitionEffectState {
  preset: GpuTransitionPreset;
  /** Visibility, after the same easing used by legacy transitions. */
  progress: number;
  edge: 'entry' | 'exit';
}
