import type { RenderedVideoWindow } from './useCameraZoom.types';

export function drawInCameraSpace(context: CanvasRenderingContext2D, window: RenderedVideoWindow, draw: () => void) {
  context.save();
  context.beginPath();
  context.roundRect(window.dx, window.dy, window.dw, window.dh, 0);
  context.clip();
  context.translate(window.dx + window.dw / 2, window.dy + window.dh / 2);
  context.scale(window.scale, window.scale);
  context.translate(-window.focusX, -window.focusY);
  draw();
  context.restore();
}
