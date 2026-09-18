import { outputPreviewRect, type OutputCanvasSettings } from './output-canvas';

export interface CanvasFrameCapture {
  bytes: ArrayBuffer;
  width: number;
  height: number;
}

export async function captureCanvasFrame(
  source: HTMLCanvasElement | null,
  logicalSize: { width: number; height: number },
  output: OutputCanvasSettings,
): Promise<CanvasFrameCapture> {
  if (!source || logicalSize.width <= 0 || logicalSize.height <= 0) throw new Error('The canvas preview is not ready.');
  if (typeof OffscreenCanvas === 'undefined') throw new Error('Canvas capture is unavailable.');

  const preview = outputPreviewRect(logicalSize.width, logicalSize.height, output);
  const scaleX = source.width / logicalSize.width;
  const scaleY = source.height / logicalSize.height;
  const target = new OffscreenCanvas(output.width, output.height);
  const context = target.getContext('2d');
  if (!context) throw new Error('Canvas capture could not create a drawing surface.');

  context.imageSmoothingEnabled = true;
  context.imageSmoothingQuality = 'high';
  context.drawImage(
    source,
    preview.x * scaleX,
    preview.y * scaleY,
    preview.width * scaleX,
    preview.height * scaleY,
    0,
    0,
    output.width,
    output.height,
  );
  const blob = await target.convertToBlob({ type: 'image/png' });
  if (!blob.size) throw new Error('Canvas capture produced an empty image.');
  return { bytes: await blob.arrayBuffer(), width: output.width, height: output.height };
}
