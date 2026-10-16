import type { CameraTransform } from './zoom-spring';
import type { OrbitCameraPose } from './orbit-camera-types';
export interface BlurCameraTransform extends CameraTransform {
  orbit?: OrbitCameraPose;
}
export interface NormalizedBlurCameraTransform extends BlurCameraTransform {
  tiltX: number;
  tiltY: number;
}
export interface ZoomMotionBlurSample {
  camera: BlurCameraTransform;
  weight: number;
}
export interface ZoomMotionBlurOptions {
  previous: BlurCameraTransform;
  center?: BlurCameraTransform;
  current: BlurCameraTransform;
  intensity: number;
  deltaMs: number;
  sampleCount?: number;
  viewportWidth?: number;
  viewportHeight?: number;
}
export interface BlurCameraInput {
  focus: { cx: number; cy: number };
  scale: number;
  tiltX?: number;
  tiltY?: number;
  orbit?: OrbitCameraPose;
}
