import type { ClipAppearance } from '@beam/engine/shared/composition-types';

export interface MediaRect {
  x: number;
  y: number;
  width: number;
  height: number;
}
export interface AdaptiveShadowRequest {
  source: CanvasImageSource;
  sourceRect?: MediaRect;
  fallbackColor?: string;
}
export interface VisualMediaSource {
  source: CanvasImageSource;
  width: number;
  height: number;
}
export interface DecoratedMediaOptions {
  /** Intrinsic crop dimensions when the drawable is a reduced raster. */
  sourceSize?: { width: number; height: number };
  source: CanvasImageSource;
  sourceRect?: MediaRect;
  rect: MediaRect;
  appearance?: ClipAppearance;
  /** Pixel-based appearance values are stored in output pixels; preview callers provide their display scale. */
  shadowScale?: number;
  /** Derive the shadow silhouette from the rendered source pixels instead of its bounding box. */
  shadowFollowsSourceAlpha?: boolean;
  title: string;
  mirrored?: boolean;
  mirroredY?: boolean;
  rotation?: number;
  mask?: 'circle' | 'squircle';
}
