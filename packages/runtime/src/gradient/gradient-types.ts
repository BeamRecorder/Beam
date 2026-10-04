import type { GradientRenderer } from './gradient-renderer';
import type { Canvas2DContext } from '../canvas-types';
export type LabColor = [number, number, number];
export interface GradientRect {
  x: number;
  y: number;
  width: number;
  height: number;
  rotation?: number;
}
export interface GradientTransform {
  a: number;
  b: number;
  c: number;
  d: number;
  e: number;
  f: number;
}
export interface GradientProjection {
  x: [number, number, number];
  y: [number, number, number];
}
export interface LayerEffectSurfaces {
  layer: OffscreenCanvas;
  base: OffscreenCanvas;
  result: OffscreenCanvas;
  layerContext: Canvas2DContext;
  baseContext: Canvas2DContext;
  resultContext: Canvas2DContext;
}

export interface LayerEffectRuntime extends LayerEffectSurfaces {
  renderer?: GradientRenderer;
}
