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
  rotation3d?: import('../layout/layer-perspective-types').LayerRotation3d;
  groupId?: string;
  effects?: import('../gradient/gradient-types').LayerEffect[];
  id: string;
  opacity: number;
  blendMode: LayerBlendMode;
  locked: boolean;
}
