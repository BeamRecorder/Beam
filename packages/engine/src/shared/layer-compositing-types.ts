import type { LayerRotation3d } from '../layout/layer-perspective-types';
import type { LayerEffect } from '../gradient/gradient-types';
export type LayerBlendMode =
  | 'source-over'
  | 'darken'
  | 'multiply'
  | 'color-burn'
  | 'lighten'
  | 'screen'
  | 'color-dodge'
  | 'lighter'
  | 'overlay'
  | 'soft-light'
  | 'hard-light'
  | 'difference'
  | 'exclusion'
  | 'hue'
  | 'saturation'
  | 'color'
  | 'luminosity';

export interface LayerCompositing {
  rotation3d?: LayerRotation3d;
  groupId?: string;
  effects?: LayerEffect[];
  id: string;
  opacity: number;
  blendMode: LayerBlendMode;
  locked: boolean;
}
