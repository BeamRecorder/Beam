import type { CursorTelemetryPoint } from '../capture/capture-session';
import type { AppliedZoom, ZoomAutoFollowSettings, ZoomElement, ZoomFocus } from './zoom-types';
import type { CameraTransform, CameraVelocity } from './zoom-spring';
import type { AutoFollowState } from './auto-follow-camera-types';
import type { OrbitCameraPose } from './orbit-camera-types';

export interface CameraSimulationState {
  camera: Required<CameraTransform>;
  velocity: CameraVelocity;
  autoFollow: AutoFollowState;
  connection?: CameraConnectionState;
}

export interface CameraConnectionState {
  fromId: string;
  toId: string;
  from: ZoomFocus;
  to: ZoomFocus;
}

export interface CameraSample {
  focus: ZoomFocus;
  scale: number;
  tiltX?: number;
  tiltY?: number;
  orbit?: OrbitCameraPose;
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
  /** Exclusive end of the current screen clip; prediction must not cross an edit. */
  followEndMsAt?: (timelineTimeMs: number) => number;
  autoFollow?: ZoomAutoFollowSettings;
}

export interface CameraCheckpointReuse {
  previous: CompositionCameraEvaluator;
  unchangedBeforeMs: number;
}

/** Whether a region may follow at this recorded source timestamp. */
export type CameraFollowGate = (elementId: string | undefined, sourceTimeMs: number) => boolean;

export type CameraFollowCursor = (zoom: AppliedZoom, timelineTimeMs: number) => ZoomFocus | null;
