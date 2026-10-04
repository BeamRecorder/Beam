import type { ShapeVector, ArrowMarker, ArrowPreset } from './shape-vector-types';
export const MAX_VECTOR_NODES: number;
export const ARROW_MARKERS: readonly ArrowMarker[];
export const ARROW_VECTOR_PRESETS: readonly ArrowPreset[];
export function isShapeVector(value: unknown): value is ShapeVector;
