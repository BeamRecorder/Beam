import type { AppliedTransform } from '../recordly/videoPlayback/cameraMotionBlur';
import type { MotionBlurState } from '../recordly/videoPlayback/zoomTransform';
import type { CursorFollowCameraState } from '../recordly/videoPlayback/cursorFollowCamera';
import type { SpringState } from '../recordly/videoPlayback/motionSmoothing';
import type { Container, MotionBlurFilter, ZoomBlurFilter } from '../recordly/render-control-types';
import type { CameraSample } from '../composition-camera-types';

export interface CameraComposeRequest {
  timeMs: number;
  isPlaying: boolean;
  isSeeking?: boolean;
  shouldSnapPausedFrame?: boolean;
  exporting?: boolean;
}
export interface RecordlyFrameEffect {
  transform: AppliedTransform;
  width: number;
  height: number;
  pan: MotionBlurFilter;
  zoom: ZoomBlurFilter;
}
export interface RecordlyCameraState {
  follow: CursorFollowCameraState;
  scale: SpringState;
  x: SpringState;
  y: SpringState;
  blur: MotionBlurState;
  panFilter: MotionBlurFilter;
  zoomFilter: ZoomBlurFilter;
  container: Container;
  applied: AppliedTransform;
  timeMs: number | null;
  resetFollowOnResume: boolean;
  sample: CameraSample;
}

export interface RecordlySourceSample {
  clipId: string;
  timeMs: number;
}
