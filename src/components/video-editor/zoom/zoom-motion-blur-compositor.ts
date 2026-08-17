import type { Canvas2DContext } from '~/types/canvas';
import { sourceOverAlpha, type ZoomMotionBlurSample } from './zoom-motion-blur';

export type MotionBlurSurface = OffscreenCanvas;

export function createMotionBlurSurface(width: number, height: number): MotionBlurSurface | null {
  return typeof OffscreenCanvas !== 'undefined' ? new OffscreenCanvas(width, height) : null;
}

export function resizeMotionBlurSurface(surface: MotionBlurSurface, width: number, height: number) {
  if (surface.width !== width) surface.width = width;
  if (surface.height !== height) surface.height = height;
}

export function compositeIsolatedMotionBlurSample(options: {
  target: Canvas2DContext;
  surface: MotionBlurSurface;
  logicalWidth: number;
  logicalHeight: number;
  pixelScale: number;
  sample: ZoomMotionBlurSample;
  accumulatedWeight: number;
  draw: (context: Canvas2DContext, sample: ZoomMotionBlurSample) => void;
}) {
  const { target, surface, logicalWidth, logicalHeight, pixelScale, sample, accumulatedWeight, draw } = options;
  const context = surface.getContext('2d') as Canvas2DContext | null;
  if (!context) return false;

  context.setTransform(pixelScale, 0, 0, pixelScale, 0, 0);
  context.globalAlpha = 1;
  context.globalCompositeOperation = 'source-over';
  context.filter = 'none';
  context.shadowColor = 'transparent';
  context.shadowBlur = 0;
  context.shadowOffsetX = 0;
  context.shadowOffsetY = 0;
  context.clearRect(0, 0, logicalWidth, logicalHeight);
  draw(context, sample);

  target.save();
  target.globalAlpha = sourceOverAlpha(sample.weight, accumulatedWeight);
  target.drawImage(surface, 0, 0, surface.width, surface.height, 0, 0, logicalWidth, logicalHeight);
  target.restore();
  return true;
}
