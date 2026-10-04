import {
  createMotionBlurSurface,
  resizeMotionBlurSurface,
  type MotionBlurSurface,
} from '@beam/runtime/zoom/zoom-motion-blur-compositor';

let surface: MotionBlurSurface | null = null;
export function getExportMotionBlurSurface(width: number, height: number): MotionBlurSurface | null {
  surface ??= createMotionBlurSurface(width, height);
  if (surface) resizeMotionBlurSurface(surface, width, height);
  return surface;
}
export function disposeExportMotionBlurSurface(): void {
  surface = null;
}
