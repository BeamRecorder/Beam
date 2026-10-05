export type AnimatedFramePreset = 'purple-haze' | 'neon-duo' | 'aurora' | 'ember' | 'electric';

export interface AnimatedFrameSettings {
  preset: AnimatedFramePreset;
  /** Border thickness in output pixels. */
  width: number;
  /** Timeline speed multiplier; zero freezes the effect. */
  speed: number;
}

export const DEFAULT_ANIMATED_FRAME: Readonly<AnimatedFrameSettings> = {
  preset: 'purple-haze',
  width: 3,
  speed: 1,
};
