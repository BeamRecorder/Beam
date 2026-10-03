export type GlassCanvas = OffscreenCanvas | HTMLCanvasElement;
export interface GlassGpuProgram {
  program: WebGLProgram;
  uniforms: Record<string, WebGLUniformLocation>;
}
export interface GlassMaskTexture {
  path: readonly { x: number; y: number }[];
  texture: WebGLTexture;
}
