import type { ZoomMotionBlurTuning } from './recordly/types';

export interface RecordlyZoomSettings {
  zoomInDurationMs: number;
  zoomOutDurationMs: number;
  zoomSmoothness: number;
  zoomClassicMode: boolean;
  connectZooms: boolean;
  connectedZoomGapMs: number;
  connectedZoomDurationMs: number;
  cameraSpringStiffnessMultiplier: number;
  cameraSpringDampingMultiplier: number;
  cameraSpringMassMultiplier: number;
  defaultDurationMs: number;
  zoomMotionBlur: number;
  zoomMotionBlurTuning: ZoomMotionBlurTuning;
  loopCursor: boolean;
}
export type RecordlyZoomPreset = 'focused' | 'smooth';
