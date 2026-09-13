import type { Canvas2DContext } from '~/types/canvas';

export interface EffectRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface BlurEffectOptions {
  source?: CanvasImageSource;
  bounds?: EffectRect;
  maskPath?: (context: Canvas2DContext, rect: EffectRect) => void;
}

export type ScratchCanvas = HTMLCanvasElement | OffscreenCanvas;
export interface ScratchSurface {
  canvas: ScratchCanvas;
  context: Canvas2DContext;
}
export interface ScratchPool {
  source: ScratchSurface;
  effect: ScratchSurface;
  mask: ScratchSurface;
  pixel: ScratchSurface;
}
