import { outputPreviewRect, type OutputCanvasSettings } from '@beam/engine/layout/output-canvas';

export function canvasPreviewStyle(size: { width: number; height: number }, output: OutputCanvasSettings) {
  const preview = outputPreviewRect(size.width, size.height, output);
  return { left: `${preview.x}px`, top: `${preview.y}px`, width: `${preview.width}px`, height: `${preview.height}px` };
}
