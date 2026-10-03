export type AlignmentAxis = 0 | 0.5 | 1;
export interface CanvasAlignment {
  x: AlignmentAxis;
  y: AlignmentAxis;
}
export interface TransformAlignment {
  x: AlignmentAxis | null;
  y: AlignmentAxis | null;
}
