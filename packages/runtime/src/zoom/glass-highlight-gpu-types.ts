import type { Canvas2DContext } from '../canvas-types';
import type { GlassHighlightGpu } from './glass-highlight-gpu';

export type GlassCanvas = OffscreenCanvas | HTMLCanvasElement;
export interface GlassScenePainter {
  draw: (context: Canvas2DContext, width: number, height: number) => void;
  dispose: (context: Canvas2DContext) => void;
}
export interface GlassRenderResources {
  gpu: GlassHighlightGpu;
  scene: GlassCanvas;
  disposeScene?: GlassScenePainter['dispose'];
}
export interface GlassGpuProgram {
  program: WebGLProgram;
  uniforms: Record<string, WebGLUniformLocation>;
}
export interface GlassMaskTexture {
  path: readonly { x: number; y: number }[];
  texture: WebGLTexture;
}
