import type { CursorTelemetryPoint } from '../capture/capture-session';
import type { AppliedZoom, ZoomAutoFollowSettings, ZoomElement, ZoomFocus } from './zoom-types';
import type { CameraTransform, CameraVelocity } from './zoom-spring';
import type { AutoFollowState } from './auto-follow-camera';

export interface CameraSimulationState {
  camera: Required<CameraTransform>;
  velocity: CameraVelocity;
  autoFollow: AutoFollowState;
}

export interface CameraSample {
  focus: ZoomFocus;
  scale: number;
  tiltX?: number;
  tiltY?: number;
}

export interface CompositionCameraEvaluator {
  sample(timeMs: number): CameraSample;
  invalidate(): void;
}

export interface CompositionCameraInputs {
  zooms: readonly ZoomElement[];
  telemetry: readonly CursorTelemetryPoint[];
  mapFocus?: (focus: ZoomFocus, zoom: AppliedZoom, timeMs: number) => ZoomFocus;
  mapTelemetryTime?: (timelineTimeMs: number) => number;
  autoFollow?: ZoomAutoFollowSettings;
}

export interface CameraCheckpointReuse {
  previous: CompositionCameraEvaluator;
  unchangedBeforeMs: number;
}
