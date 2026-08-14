import { outputPreviewRect, type OutputCanvasSettings } from './output-canvas';

export function canvasGuideLines(
  logicalSize: { width: number; height: number },
  canvas: OutputCanvasSettings,
  guides: readonly { type: 'vertical' | 'horizontal'; position: number }[],
) {
  const preview = outputPreviewRect(logicalSize.width, logicalSize.height, canvas);
  return guides.map((guide) => {
    if (guide.type === 'vertical') {
      const x = preview.x + guide.position * preview.width;
      return {
        type: guide.type,
        style: { left: `${x}px`, top: `${preview.y}px`, height: `${preview.height}px` },
      };
    }
    const y = preview.y + guide.position * preview.height;
    return {
      type: guide.type,
      style: { top: `${y}px`, left: `${preview.x}px`, width: `${preview.width}px` },
    };
  });
}
