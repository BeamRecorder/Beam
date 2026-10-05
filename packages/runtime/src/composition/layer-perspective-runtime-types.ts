import type { WebGlPerspectiveProjector } from '../zoom/webgl-perspective-projector';
export interface LayerPerspectiveSurface {
  canvas: OffscreenCanvas;
  context: OffscreenCanvasRenderingContext2D;
  projector: WebGlPerspectiveProjector;
}
