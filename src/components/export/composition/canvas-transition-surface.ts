import type { Canvas2DContext } from '~/types/canvas';

let surface: OffscreenCanvas | HTMLCanvasElement | null = null;

export function getCanvasTransitionSurface(width: number, height: number) {
  if (!surface) {
    if (typeof OffscreenCanvas !== 'undefined') surface = new OffscreenCanvas(width, height);
    else if (typeof document !== 'undefined') surface = document.createElement('canvas');
  }
  if (!surface) return null;
  surface.width = width;
  surface.height = height;
  return { surface, context: surface.getContext('2d') as Canvas2DContext | null };
}

export function disposeCanvasTransitionSurface() {
  surface = null;
}
