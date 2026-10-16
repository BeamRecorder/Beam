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
  shadow: { enabled: boolean; blur: number; color: string; direction: CursorShadowDirection };
  resolution: number;
}
export interface CursorGpuAsset {
  texture: WebGLTexture;
  buffer: WebGLBuffer;
  vertices: number;
  bytes: number;
  rasterSize: number;
}
