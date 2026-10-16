import type { Canvas2DContext } from '../canvas-types';
import type { CursorGpuOptions } from '../cursor/cursor-gpu-types';
import { CursorGpuPainter } from '../cursor/cursor-gpu-painter';
import { FlatCursorExposurePainter } from '../cursor/flat-cursor-exposure';

let painter: CursorGpuPainter | null = null;
let flat: FlatCursorExposurePainter | null = null;
export function drawGpuCursor(context: Canvas2DContext, options: CursorGpuOptions) {
  painter ??= new CursorGpuPainter();
  const surface = options.volume
    ? painter.render(options)
    : (flat ??= new FlatCursorExposurePainter(painter)).render(options);
  context.drawImage(surface.canvas, surface.x, surface.y, surface.width, surface.height);
}
export function disposeGpuCursor() {
  flat?.dispose();
  flat = null;
  painter?.dispose();
  painter = null;
}
