import type { CameraTransform } from './zoom-spring';

export interface ZoomMotionBlurSample {
  camera: CameraTransform;
  weight: number;
}

interface ZoomMotionBlurOptions {
  previous: CameraTransform;
  center?: CameraTransform;
  current: CameraTransform;
  intensity: number;
  deltaMs: number;
  sampleCount?: number;
  viewportWidth?: number;
  viewportHeight?: number;
}

export const ZOOM_MOTION_BLUR_INTENSITY = 0.55;
export const ZOOM_MOTION_BLUR_SHUTTER_MS = (1_000 / 60) * 0.7;
const MAX_SAMPLES = 5;
const MIN_MOVEMENT = 0.000_1;
const MIN_VISIBLE_TRAVEL_PX = 0.75;
const HIGH_QUALITY_TRAVEL_PX = 18;
const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

const safeCamera = (camera: CameraTransform): CameraTransform => ({
  focusX: clamp(Number.isFinite(camera.focusX) ? camera.focusX : 0.5, 0, 1),
  focusY: clamp(Number.isFinite(camera.focusY) ? camera.focusY : 0.5, 0, 1),
  scale: Math.max(1, Number.isFinite(camera.scale) ? camera.scale : 1),
});

export function createZoomMotionBlurSamplePlan(options: ZoomMotionBlurOptions): ZoomMotionBlurSample[] {
  const previous = safeCamera(options.previous);
  const current = safeCamera(options.current);
  const intensity = clamp(Number.isFinite(options.intensity) ? options.intensity : 0, 0, 1);
  const center = safeCamera(options.center ?? options.current);
  const blurStart = {
    focusX: center.focusX + (previous.focusX - center.focusX) * intensity,
    focusY: center.focusY + (previous.focusY - center.focusY) * intensity,
    scale: center.scale + (previous.scale - center.scale) * intensity,
  };
  const blurEnd = {
    focusX: center.focusX + (current.focusX - center.focusX) * intensity,
    focusY: center.focusY + (current.focusY - center.focusY) * intensity,
    scale: center.scale + (current.scale - center.scale) * intensity,
  };
  const movement = Math.hypot(blurEnd.focusX - blurStart.focusX, blurEnd.focusY - blurStart.focusY);
  const scaleMovement = Math.abs(blurEnd.scale - blurStart.scale);
  if (!(options.deltaMs > 0) || intensity <= 0 || movement + scaleMovement <= MIN_MOVEMENT)
    return [{ camera: center, weight: 1 }];

  const viewportWidth = Math.max(0, Number.isFinite(options.viewportWidth) ? (options.viewportWidth ?? 0) : 0);
  const viewportHeight = Math.max(0, Number.isFinite(options.viewportHeight) ? (options.viewportHeight ?? 0) : 0);
  const hasViewport = viewportWidth > 0 && viewportHeight > 0;
  const focusTravelPx = hasViewport
    ? Math.hypot(
        (blurEnd.focusX - blurStart.focusX) * viewportWidth,
        (blurEnd.focusY - blurStart.focusY) * viewportHeight,
      ) * Math.max(blurStart.scale, blurEnd.scale)
    : 0;
  const scaleTravelPx = hasViewport ? scaleMovement * Math.hypot(viewportWidth, viewportHeight) * 0.5 : 0;
  const travelPx = focusTravelPx + scaleTravelPx;
  if (!Number.isFinite(options.sampleCount) && hasViewport && travelPx < MIN_VISIBLE_TRAVEL_PX)
    return [{ camera: center, weight: 1 }];

  const requested = Number.isFinite(options.sampleCount)
    ? Math.round(options.sampleCount ?? 3)
    : hasViewport
      ? travelPx >= HIGH_QUALITY_TRAVEL_PX
        ? 5
        : 3
      : intensity >= 0.7
        ? 5
        : 3;
  let sampleCount = clamp(requested, 3, MAX_SAMPLES);
  if (sampleCount % 2 === 0) sampleCount = Math.min(MAX_SAMPLES, sampleCount + 1);
  const rawWeights = Array.from({ length: sampleCount }, (_, index) => {
    const distanceFromCenter = Math.abs(index - (sampleCount - 1) / 2) / ((sampleCount - 1) / 2);
    return 0.25 + 0.75 * Math.cos((distanceFromCenter * Math.PI) / 2) ** 2;
  });
  const weightTotal = rawWeights.reduce((sum, weight) => sum + weight, 0);
  return rawWeights.map((weight, index) => {
    const progress = index / (sampleCount - 1);
    return {
      camera: {
        focusX: blurStart.focusX + (blurEnd.focusX - blurStart.focusX) * progress,
        focusY: blurStart.focusY + (blurEnd.focusY - blurStart.focusY) * progress,
        scale: blurStart.scale + (blurEnd.scale - blurStart.scale) * progress,
      },
      weight: weight / weightTotal,
    };
  });
}

export function sourceOverAlpha(weight: number, accumulatedWeight: number) {
  return accumulatedWeight <= 0 ? 1 : weight / (accumulatedWeight + weight);
}
