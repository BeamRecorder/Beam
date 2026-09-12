import type { CaptionStyle, NormalizedTransform } from './composition-types';

export interface ElementText {
  content: string;
  style: CaptionStyle;
  /** Percentage of the element's shorter side. */
  padding: number;
  verticalAlign: 'top' | 'center' | 'bottom';
}

export interface DrawingPoint {
  x: number;
  y: number;
}
export interface FreehandDrawing {
  /** Points in the element's local unit rectangle. */
  points: DrawingPoint[];
  smoothing: number;
  /** Width in pixels at a 1080px canvas short side. */
  strokeWidth: number;
}
export interface DrawingSettings {
  smoothing: number;
  strokeWidth: number;
  color: string;
}
export interface DrawnElement {
  drawing: FreehandDrawing;
  transform: NormalizedTransform;
}
