import type { CursorModelPose } from '@beam/engine/cursor/cursor-exposure-types';
import type { CursorShadowDirection } from '@beam/engine/capture/cursor-presentation';

export type CursorVolumePose = CursorModelPose;
export interface CursorGpuSample {
  x: number;
  y: number;
  weight: number;
}
export interface CursorGpuGeometry {
  width: number;
  height: number;
  hotspot: { x: number; y: number };
}
export interface CursorGpuOptions {
  image: HTMLImageElement | ImageBitmap;
  geometry: CursorGpuGeometry;
  samples: readonly CursorGpuSample[];
  volume?: CursorVolumePose;
  shadow: {
    enabled: boolean;
    blur: number;
    color: string;
    direction: CursorShadowDirection;
  };
  resolution: number;
}
export interface CursorGpuAsset {
  texture: WebGLTexture;
  buffer: WebGLBuffer;
  vertices: number;
  bytes: number;
  rasterSize: number;
  volume: boolean;
}

export interface CursorRasterBounds {
  x: number;
  y: number;
  width: number;
  height: number;
  pixelWidth: number;
  pixelHeight: number;
  resolution: number;
  weight: number;
}
export interface CursorRasterSurface {
  canvas: OffscreenCanvas;
  x: number;
  y: number;
  width: number;
  height: number;
}
export interface CursorStampRasterizer {
  readonly canvas: OffscreenCanvas;
  readonly gl: WebGL2RenderingContext;
  readonly maxSize: number;
  render(options: CursorGpuOptions, density?: number): CursorRasterSurface;
}
export interface CursorExposureStamp {
  image: HTMLImageElement | ImageBitmap;
  key: string;
  texture: WebGLTexture;
  width: number;
  height: number;
  x: number;
  y: number;
  bytes: number;
  retained: boolean;
  resolution: number;
}
