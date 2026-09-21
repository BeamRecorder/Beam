import type { OutputCanvasSettings } from '../canvas/output-canvas';

/** Match the display's physical pixels without downsampling the source twice. */
export function screenshotPreviewSize(
  canvas: Pick<OutputCanvasSettings, 'width' | 'height'>,
  display: { width: number; height: number },
  pixelRatio: number,
) {
  const ratio = Number.isFinite(pixelRatio) && pixelRatio > 0 ? pixelRatio : 1;
  const scale = Math.min(1, (display.width * ratio) / canvas.width, (display.height * ratio) / canvas.height);
  return {
    width: Math.max(1, Math.round(canvas.width * scale)),
    height: Math.max(1, Math.round(canvas.height * scale)),
  };
}
