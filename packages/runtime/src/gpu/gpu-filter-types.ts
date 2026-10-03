import type { GpuColor, GpuRect } from '@beam/runtime/gpu/gpu-scene-types';

export interface GpuFilterTarget {
  texture: WebGLTexture;
  width: number;
  height: number;
}
export interface GpuGaussianResult extends GpuFilterTarget {
  uv: readonly [number, number, number, number];
}
export type GpuFilterUniform =
  | 'image'
  | 'mask'
  | 'mode'
  | 'center'
  | 'weights'
  | 'offsets'
  | 'pairs'
  | 'direction'
  | 'uvRect'
  | 'maskRect'
  | 'tint'
  | 'target'
  | 'grid'
  | 'inner'
  | 'size';
export interface GpuFilterProgram {
  program: WebGLProgram;
  vao: WebGLVertexArrayObject;
  uniforms: Record<GpuFilterUniform, WebGLUniformLocation | null>;
}
export interface GpuEffectInput {
  source: TexImageSource;
  mask: TexImageSource;
  maskPadding: number;
  maskImmutable?: boolean;
  width: number;
  height: number;
  target: GpuRect;
  sigma: number;
  feather: number;
  mode: 'blur' | 'frosted' | 'pixelated' | 'opaque' | 'highlight';
  color: GpuColor;
  strength: number;
  tintOpacity: number;
  highlight: GpuColor;
  highlightStage?: 'outside' | 'inside';
}
export type GpuEffectPaint = Omit<GpuEffectInput, 'source'>;
