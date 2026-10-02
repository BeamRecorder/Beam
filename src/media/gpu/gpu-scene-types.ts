import type { EngineMetrics } from '../performance/engine-metrics';

export interface GpuRect {
  x: number;
  y: number;
  width: number;
  height: number;
}
export type GpuColor = readonly [number, number, number, number];
export type GpuSceneCommand =
  | {
      kind: 'image';
      source: TexImageSource;
      width: number;
      height: number;
      rect: GpuRect;
      crop?: GpuRect;
      mirrored?: boolean;
      mirroredY?: boolean;
      opacity?: number;
      radius?: number;
      immutable: boolean;
    }
  | { kind: 'solid'; rect: GpuRect; color: GpuColor; radius?: number }
  | { kind: 'blur'; rect: GpuRect; radius: number };
export interface GpuSceneOptions {
  canvas?: OffscreenCanvas;
  metrics?: EngineMetrics;
  maxTextureBytes?: number;
  maxTextures?: number;
  maxRenderTargetBytes?: number;
}
export interface GpuTextureEntry {
  texture: WebGLTexture;
  bytes: number;
  width: number;
  height: number;
}
export interface GpuTimerExtension {
  TIME_ELAPSED_EXT: number;
  GPU_DISJOINT_EXT: number;
}
export interface GpuProgram {
  program: WebGLProgram;
  positions: WebGLBuffer;
  position: number;
  uv: number;
  image: WebGLUniformLocation | null;
  color: WebGLUniformLocation | null;
  size: WebGLUniformLocation | null;
  radius: WebGLUniformLocation | null;
  mode: WebGLUniformLocation | null;
  instanced: WebGLUniformLocation | null;
  output: WebGLUniformLocation | null;
  instances: WebGLBuffer;
  instanceRect: number;
  instanceColor: number;
  instanceCrop: number;
  instanceTexture: number;
  images: (WebGLUniformLocation | null)[];
}
