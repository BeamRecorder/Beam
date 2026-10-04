import type { ShapeVector } from '@beam/engine/shared/shape-vector-types';
export interface VectorPaintPaths {
  key: string;
  vector: ShapeVector;
  closed: Path2D;
  open: Path2D;
  filledMarkers: Path2D;
  openMarkers: Path2D;
}
