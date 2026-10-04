import type { NormalizedTransform } from './composition-types';

export interface VectorElement {
  vector: ShapeVector;
  transform: NormalizedTransform;
}

export interface VectorPoint {
  x: number;
  y: number;
}
export type VectorSegment = [VectorPoint, VectorPoint, VectorPoint, VectorPoint];
export interface VectorSegmentHit extends VectorNodeSelection {
  t: number;
  distance: number;
}
export interface VectorSnap {
  point: VectorPoint;
  guides: { from: VectorPoint; to: VectorPoint }[];
}

export interface VectorNode extends VectorPoint {
  id: string;
  mode: 'corner' | 'smooth';
  /** Absolute control points in the layer's local coordinates. */
  in?: VectorPoint;
  out?: VectorPoint;
}

export interface VectorContour {
  closed: boolean;
  nodes: VectorNode[];
}

export type ArrowMarker = 'none' | 'triangle' | 'open' | 'circle';
export type ArrowPreset =
  | 'solid'
  | 'line'
  | 'double'
  | 'curved'
  | 'elbow'
  | 'open'
  | 'round-start'
  | 'round-head'
  | 'open-double'
  | 'filled-left'
  | 'filled-up'
  | 'filled-down'
  | 'filled-double'
  | 'chevron'
  | 'notched'
  | 'wide'
  | 'slender'
  | 'bent-filled'
  | 'arc'
  | 'reverse-curve'
  | 's-curve'
  | 'wave'
  | 'hook'
  | 'u-turn'
  | 'zigzag'
  | 'loop'
  | 'elbow-double'
  | 'arc-double'
  | 'filled-curved'
  | 'swoosh';

export interface ArrowDefinition {
  id: ArrowPreset;
  path: string;
  aspectRatio: number;
  start?: ArrowMarker;
  end?: ArrowMarker;
}

export interface ShapeVector {
  version: 1;
  contours: VectorContour[];
  fillRule: 'nonzero' | 'evenodd';
  strokeWidth: number;
  startMarker: ArrowMarker;
  endMarker: ArrowMarker;
  markerSize: number;
  arrowPreset?: ArrowPreset;
}

export interface VectorNodeSelection {
  contour: number;
  node: number;
}

export interface VectorHandleSelection extends VectorNodeSelection {
  handle?: 'in' | 'out';
}
