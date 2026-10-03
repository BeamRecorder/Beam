import type { LayerPerspectiveRect } from './layer-perspective-types';
export interface AlignmentLine {
  type: 'horizontal' | 'vertical';
  position: number;
}
export interface AlignmentMeasurement {
  axis: 'x' | 'y';
  from: number;
  to: number;
  cross: number;
  pixels: number;
  kind: 'size' | 'spacing';
}
export interface IndexedAlignmentResult {
  x: number;
  y: number;
  guides: AlignmentLine[];
  measurements: AlignmentMeasurement[];
}
export interface AlignmentIndexOptions {
  targets: readonly LayerPerspectiveRect[];
  canvas: { width: number; height: number };
}
