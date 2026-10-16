import type { Canvas2DContext } from '../canvas-types';
import type { CursorGpuOptions } from '../cursor/cursor-gpu-types';
import { CursorGpuPainter } from '../cursor/cursor-gpu-painter';

let painter: CursorGpuPainter | null = null;
export function drawGpuCursor(context: Canvas2DContext, options: CursorGpuOptions) {
  painter ??= new CursorGpuPainter();
  const surface = painter.render(options);
  context.drawImage(surface.canvas, surface.x, surface.y, surface.width, surface.height);
}
export function disposeGpuCursor() {
  painter?.dispose();
  painter = null;
}
