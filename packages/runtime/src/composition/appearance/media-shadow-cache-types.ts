import type { Canvas2DContext } from '@beam/runtime/canvas-types';
// Geometric media shadows only; colored shapes retain their native paint sequence.

export interface MediaShadowRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface MediaShadowRasterPlan {
  key: string;
  x: number;
  y: number;
  width: number;
  height: number;
  transform: [number, number, number, number, number, number];
}

export interface MediaShadowEntry {
  canvas: OffscreenCanvas;
  bytes: number;
}

export interface MediaShadowCacheState {
  entries: Map<string, MediaShadowEntry>;
  pending: Set<string>;
  bytes: number;
}

export interface MediaShadowOptions {
  rect: MediaShadowRect;
  /** Device-pixel shadow spread, independent of the canvas transform. */
  bleed: number;
  identity: string;
  paint(context: Canvas2DContext): void;
}
