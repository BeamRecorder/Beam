import type { NormalizedTransform } from './composition-types';

export type ShapeFillRule = 'nonzero' | 'evenodd';

export interface ShapeTextRegion {
  /** Text body in the preset's unit viewBox, excluding decorative tails. */
  bounds: NormalizedTransform;
  /** Body anchors retain their SVG identities when vector edits reframe the layer. */
  vectorNodeIds: readonly string[];
}

export interface ShapeDefinition {
  id: string;
  name: string;
  keywords: readonly string[];
  viewBox: string;
  width: number;
  height: number;
  path: string;
  fillRule?: ShapeFillRule;
  textRegion?: ShapeTextRegion;
}
