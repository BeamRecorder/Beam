import type { NormalizedTransform } from '@beam/engine/shared/composition-types';
import type { ShapeVector, VectorHandleSelection, VectorNode } from '@beam/engine/shared/shape-vector-types';
export interface AnchorDrag {
  pointerId: number;
  target: HTMLElement;
  previous: VectorNode[];
}
export interface VectorDrag {
  pointerId: number;
  layerId: string;
  selection: VectorHandleSelection;
  vector: ShapeVector;
  transform: NormalizedTransform;
  matrix: number[];
  width: number;
  height: number;
  target: Element;
}
