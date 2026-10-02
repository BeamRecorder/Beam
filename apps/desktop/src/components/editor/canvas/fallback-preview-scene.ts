import type { RenderedVideoWindow } from './composables/useCameraZoom';

export function drawFallbackPreviewScene(options: {
  context: CanvasRenderingContext2D;
  preview: { x: number; y: number; width: number; height: number };
  radius: number;
  drawBackground: () => void;
  drawVisuals: (window: RenderedVideoWindow) => void;
}): RenderedVideoWindow {
  const { context, preview } = options;
  const window = {
    dx: preview.x,
    dy: preview.y,
    dw: preview.width,
    dh: preview.height,
    scale: 1,
    focusX: preview.x + preview.width / 2,
    focusY: preview.y + preview.height / 2,
    tiltX: 0,
    tiltY: 0,
  };
  context.save();
  context.beginPath();
  context.roundRect(preview.x, preview.y, preview.width, preview.height, options.radius);
  context.clip();
  options.drawBackground();
  options.drawVisuals(window);
  context.restore();
  return window;
}
