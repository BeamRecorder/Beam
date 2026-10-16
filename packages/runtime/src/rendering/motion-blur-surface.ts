import {
  createMotionBlurSurface,
  resizeMotionBlurSurface,
  type MotionBlurSurface,
} from '@beam/runtime/zoom/zoom-motion-blur-compositor';
import type { Canvas2DContext } from '../canvas-types';
import type { ZoomMotionBlurSample } from '@beam/engine/zoom/zoom-motion-blur-types';

let surface: MotionBlurSurface | null = null;
let accumulation: MotionBlurSurface | null = null;
export function getExportMotionBlurSurface(width: number, height: number): MotionBlurSurface | null {
  surface ??= createMotionBlurSurface(width, height);
  if (surface) resizeMotionBlurSurface(surface, width, height);
  return surface;
}
export function disposeExportMotionBlurSurface(): void {
  if (surface) surface.width = surface.height = 0;
  if (accumulation) accumulation.width = accumulation.height = 0;
  surface = null;
  accumulation = null;
}

/** Linear premultiplied exposure; transparent shadows must not be source-overed repeatedly. */
export function renderExportMotionBlur(
  target: Canvas2DContext,
  width: number,
  height: number,
  samples: readonly ZoomMotionBlurSample[],
  draw: (context: Canvas2DContext, sample: ZoomMotionBlurSample) => void,
) {
  if (!samples.length) throw new RangeError('Motion blur needs at least one sample.');
  const sampleSurface = getExportMotionBlurSurface(width, height);
  accumulation ??= createMotionBlurSurface(width, height);
  if (!sampleSurface || !accumulation) throw new Error('OffscreenCanvas is required for motion blur.');
  resizeMotionBlurSurface(accumulation, width, height);
  const sampleContext = sampleSurface.getContext('2d'),
    accumulator = accumulation.getContext('2d');
  if (!sampleContext || !accumulator) throw new Error('Motion blur canvas context unavailable.');
  accumulator.setTransform(1, 0, 0, 1, 0, 0);
  accumulator.clearRect(0, 0, width, height);
  accumulator.globalCompositeOperation = 'lighter';
  for (const sample of samples) {
    sampleContext.setTransform(1, 0, 0, 1, 0, 0);
    sampleContext.clearRect(0, 0, width, height);
    sampleContext.save();
    try {
      draw(sampleContext, sample);
    } finally {
      sampleContext.restore();
    }
    accumulator.globalAlpha = sample.weight;
    accumulator.drawImage(sampleSurface, 0, 0);
  }
  target.drawImage(accumulation, 0, 0);
}
