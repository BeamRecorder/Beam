import type {
  BlurCameraTransform,
  ZoomMotionBlurSample,
  ZoomMotionBlurOptions,
  BlurCameraInput,
  NormalizedBlurCameraTransform,
} from './zoom-motion-blur-types';
import type { OrbitCameraPose } from './orbit-camera-types';
export type { ZoomMotionBlurSample } from './zoom-motion-blur-types';
const orbitBetween = (
  a: OrbitCameraPose | undefined,
  b: OrbitCameraPose | undefined,
  t: number,
): OrbitCameraPose | undefined => {
  if (!a && !b) return undefined;
  const from = a ?? { azimuth: 0, elevation: 0, distance: b!.distance, strength: 0 };
  const to = b ?? { azimuth: 0, elevation: 0, distance: a!.distance, strength: 0 };
  return {
    azimuth: from.azimuth + (to.azimuth - from.azimuth) * t,
    elevation: from.elevation + (to.elevation - from.elevation) * t,
    distance: from.distance + (to.distance - from.distance) * t,
    zoomScale: (from.zoomScale ?? 1) + ((to.zoomScale ?? 1) - (from.zoomScale ?? 1)) * t,
    framingDistance:
      (from.framingDistance ?? from.distance) +
      ((to.framingDistance ?? to.distance) - (from.framingDistance ?? from.distance)) * t,
    strength: from.strength + (to.strength - from.strength) * t,
    roll: (from.roll ?? 0) + ((to.roll ?? 0) - (from.roll ?? 0)) * t,
    maxAzimuth:
      (from.maxAzimuth ?? ((22 * Math.PI) / 180) * from.strength) +
      ((to.maxAzimuth ?? ((22 * Math.PI) / 180) * to.strength) -
        (from.maxAzimuth ?? ((22 * Math.PI) / 180) * from.strength)) *
        t,
    maxElevation:
      (from.maxElevation ?? ((16 * Math.PI) / 180) * from.strength) +
      ((to.maxElevation ?? ((16 * Math.PI) / 180) * to.strength) -
        (from.maxElevation ?? ((16 * Math.PI) / 180) * from.strength)) *
        t,
    pullback: (from.pullback ?? 0) + ((to.pullback ?? 0) - (from.pullback ?? 0)) * t,
  };
};

export const ZOOM_MOTION_BLUR_INTENSITY = 0.55;
export const ZOOM_MOTION_BLUR_SHUTTER_MS = (1_000 / 60) * 0.7;
const MAX_SAMPLES = 5;
const MIN_MOVEMENT = 0.000_1;
const MIN_VISIBLE_TRAVEL_PX = 0.75;
const HIGH_QUALITY_TRAVEL_PX = 18;
const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

export function createCameraMotionBlurPlan(options: {
  sampleAt: (timeMs: number) => BlurCameraInput;
  center?: BlurCameraInput;
  timeMs: number;
  intensity: number;
  sampleCount?: number;
  viewportWidth: number;
  viewportHeight: number;
}) {
  const cameraFrom = (value: BlurCameraInput): BlurCameraTransform => ({
    focusX: value.focus.cx,
    focusY: value.focus.cy,
    scale: value.scale,
    tiltX: value.tiltX ?? 0,
    tiltY: value.tiltY ?? 0,
    ...(value.orbit ? { orbit: value.orbit } : {}),
  });
  const cameraAt = (timeMs: number) => cameraFrom(options.sampleAt(Math.max(0, timeMs)));
  const center = options.center ? cameraFrom(options.center) : cameraAt(options.timeMs);
  if (!(options.intensity > 0)) return [{ camera: center, weight: 1 }];
  const halfShutterMs = ZOOM_MOTION_BLUR_SHUTTER_MS / 2;
  return createZoomMotionBlurSamplePlan({
    previous: cameraAt(options.timeMs - halfShutterMs),
    center,
    current: cameraAt(options.timeMs + halfShutterMs),
    intensity: options.intensity,
    deltaMs: halfShutterMs * 2,
    sampleCount: options.sampleCount,
    viewportWidth: options.viewportWidth,
    viewportHeight: options.viewportHeight,
  });
}

const safeCamera = (camera: BlurCameraTransform): NormalizedBlurCameraTransform => ({
  focusX: clamp(Number.isFinite(camera.focusX) ? camera.focusX : 0.5, 0, 1),
  focusY: clamp(Number.isFinite(camera.focusY) ? camera.focusY : 0.5, 0, 1),
  scale: Math.max(1, Number.isFinite(camera.scale) ? camera.scale : 1),
  tiltX: Number.isFinite(camera.tiltX) ? camera.tiltX! : 0,
  tiltY: Number.isFinite(camera.tiltY) ? camera.tiltY! : 0,
  ...(camera.orbit ? { orbit: camera.orbit } : {}),
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
    tiltX: center.tiltX + (previous.tiltX - center.tiltX) * intensity,
    tiltY: center.tiltY + (previous.tiltY - center.tiltY) * intensity,
    orbit: orbitBetween(center.orbit, previous.orbit, intensity),
  };
  const blurEnd = {
    focusX: center.focusX + (current.focusX - center.focusX) * intensity,
    focusY: center.focusY + (current.focusY - center.focusY) * intensity,
    scale: center.scale + (current.scale - center.scale) * intensity,
    tiltX: center.tiltX + (current.tiltX - center.tiltX) * intensity,
    tiltY: center.tiltY + (current.tiltY - center.tiltY) * intensity,
    orbit: orbitBetween(center.orbit, current.orbit, intensity),
  };
  const movement = Math.hypot(blurEnd.focusX - blurStart.focusX, blurEnd.focusY - blurStart.focusY);
  const scaleMovement = Math.abs(blurEnd.scale - blurStart.scale);
  const tiltMovement = Math.hypot(blurEnd.tiltX - blurStart.tiltX, blurEnd.tiltY - blurStart.tiltY);
  const orbitMovement = Math.hypot(
    (blurEnd.orbit?.azimuth ?? 0) - (blurStart.orbit?.azimuth ?? 0),
    (blurEnd.orbit?.elevation ?? 0) - (blurStart.orbit?.elevation ?? 0),
    (blurEnd.orbit?.roll ?? 0) - (blurStart.orbit?.roll ?? 0),
    (blurEnd.orbit?.pullback ?? 0) - (blurStart.orbit?.pullback ?? 0),
    (blurEnd.orbit?.distance ?? 0) - (blurStart.orbit?.distance ?? 0),
  );
  if (
    !(options.deltaMs > 0) ||
    intensity <= 0 ||
    movement + scaleMovement + tiltMovement + orbitMovement <= MIN_MOVEMENT
  )
    return [{ camera: center, weight: 1 }];

  const viewportWidth = Math.max(0, Number.isFinite(options.viewportWidth) ? options.viewportWidth! : 0);
  const viewportHeight = Math.max(0, Number.isFinite(options.viewportHeight) ? options.viewportHeight! : 0);
  const hasViewport = viewportWidth > 0 && viewportHeight > 0;
  const focusTravelPx = hasViewport
    ? Math.hypot(
        (blurEnd.focusX - blurStart.focusX) * viewportWidth,
        (blurEnd.focusY - blurStart.focusY) * viewportHeight,
      ) * Math.max(blurStart.scale, blurEnd.scale)
    : 0;
  const scaleTravelPx = hasViewport ? scaleMovement * Math.hypot(viewportWidth, viewportHeight) * 0.5 : 0;
  const tiltTravelPx = hasViewport
    ? Math.hypot(
        (blurEnd.tiltX - blurStart.tiltX) * viewportHeight,
        (blurEnd.tiltY - blurStart.tiltY) * viewportWidth,
      ) * 0.5
    : 0;
  const travelPx =
    focusTravelPx + scaleTravelPx + tiltTravelPx + orbitMovement * Math.hypot(viewportWidth, viewportHeight) * 0.5;
  if (!Number.isFinite(options.sampleCount) && hasViewport && travelPx < MIN_VISIBLE_TRAVEL_PX)
    return [{ camera: center, weight: 1 }];

  const requested = Number.isFinite(options.sampleCount)
    ? Math.round(options.sampleCount!)
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
        tiltX: blurStart.tiltX + (blurEnd.tiltX - blurStart.tiltX) * progress,
        tiltY: blurStart.tiltY + (blurEnd.tiltY - blurStart.tiltY) * progress,
        ...(blurStart.orbit || blurEnd.orbit ? { orbit: orbitBetween(blurStart.orbit, blurEnd.orbit, progress) } : {}),
      },
      weight: weight / weightTotal,
    };
  });
}

export function sourceOverAlpha(weight: number, accumulatedWeight: number) {
  return accumulatedWeight <= 0 ? 1 : weight / (accumulatedWeight + weight);
}
