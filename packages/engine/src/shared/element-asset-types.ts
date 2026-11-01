import type { ShapeLayerStyle } from './shape-layer-types';

export interface ElementAsset {
  id: string;
  name: string;
  style: ShapeLayerStyle;
  size: { width: number; height: number };
}
