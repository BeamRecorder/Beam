import type { TransitionPreset } from './composition-types';

export interface TransitionCard {
  id: string;
  labelKey: string;
  preset: TransitionPreset;
}
export interface TransitionCategory {
  id: 'basics' | 'zooms' | 'panels' | 'shapes' | 'color' | 'dynamic' | 'digital';
  labelKey: string;
  presets: readonly TransitionCard[];
}
