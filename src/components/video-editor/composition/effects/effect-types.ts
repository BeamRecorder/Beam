import type { Canvas2DContext } from '~/types/canvas';
import type { GpuEffectsRenderer } from '~/media/gpu/gpu-effects-renderer';
import type { BlurMaskCache } from './blur-mask-cache';

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
  /** Caller-owned identity of immutable custom geometry; omit for dynamic callbacks. */
  maskCacheKey?: string;
}

export type ScratchCanvas = HTMLCanvasElement | OffscreenCanvas;
export interface ScratchSurface {
  canvas: ScratchCanvas;
  context: Canvas2DContext;
}
export interface GpuEffectPlan {
  region: EffectRect;
  target: EffectRect;
  maskTarget: EffectRect;
  sigma: number;
  feather: number;
  matrix?: DOMMatrix;
}
export interface GpuEffectOwner {
  gpu: GpuEffectsRenderer;
  source: ScratchSurface;
  mask: ScratchSurface;
  cache: BlurMaskCache;
  groupRegion: EffectRect | null;
}
