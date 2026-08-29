import type { CursorTelemetryPoint } from '../../../api/types/capture-session';
import { createCameraVelocity, stepCameraSpring, type CameraTransform, type CameraVelocity } from './zoom-spring';
import { clampFocusToScale, createZoomTimeEvaluator, cursorFocusAt } from './zoom-playback';
import {
  cameraSpringOmega,
  createAutoFollowState,
  updateAutoFollowTarget,
  type AutoFollowState,
} from './auto-follow-camera';
import {
  DEFAULT_ZOOM_TILT_HORIZONTAL,
  DEFAULT_ZOOM_TILT_VERTICAL,
  DEFAULT_ZOOM_AUTO_FOLLOW,
  normalizeZoomAutoFollow,
  type AppliedZoom,
  type ZoomAutoFollowSettings,
  type ZoomElement,
  type ZoomFocus,
} from './zoom-types';

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

interface SimulationState {
  camera: CameraTransform;
  velocity: CameraVelocity;
  autoFollow: AutoFollowState;
}

const STEP_MS = 1_000 / 120;
const CHECKPOINT_STEPS = 30;
export const MAX_CAMERA_TILT_RADIANS = (62 * Math.PI) / 180;

export function cameraTiltForControls(intensity: number, horizontal: number, vertical: number) {
  const normalizedIntensity = Math.min(1, Math.max(0, Number.isFinite(intensity) ? intensity : 0));
  const normalizedHorizontal = Math.min(1, Math.max(-1, Number.isFinite(horizontal) ? horizontal : 0));
  const normalizedVertical = Math.min(1, Math.max(-1, Number.isFinite(vertical) ? vertical : 0));
  const directionScale = Math.max(1, Math.hypot(normalizedHorizontal, normalizedVertical));
  return {
    tiltX: (normalizedVertical / directionScale) * MAX_CAMERA_TILT_RADIANS * normalizedIntensity,
    tiltY: (normalizedHorizontal / directionScale) * MAX_CAMERA_TILT_RADIANS * normalizedIntensity,
  };
}
const cloneState = (state: SimulationState): SimulationState => ({
  camera: { ...state.camera },
  velocity: { ...state.velocity },
  autoFollow: {
    ...state.autoFollow,
    settings: { ...state.autoFollow.settings },
    target: { ...state.autoFollow.target },
    frozenTarget: { ...state.autoFollow.frozenTarget },
  },
});

export function createCompositionCameraEvaluator(inputs: CompositionCameraInputs): CompositionCameraEvaluator {
  const checkpoints = new Map<number, SimulationState>();
  const zoomAt = createZoomTimeEvaluator(inputs.zooms, inputs.telemetry, inputs.mapFocus);
  const autoFollowSettings = normalizeZoomAutoFollow(inputs.autoFollow ?? DEFAULT_ZOOM_AUTO_FOLLOW);
  const sortedTelemetry = [...inputs.telemetry].sort((left, right) => left.timeMs - right.timeMs);
  const targetAt = (
    timeMs: number,
    autoFollow: AutoFollowState,
  ): { camera: CameraTransform; tracksCursor: boolean } => {
    const zoom = zoomAt(timeMs);
    if (!zoom) {
      updateAutoFollowTarget(autoFollow, null, { cx: 0.5, cy: 0.5 }, 1, 0, timeMs);
      return { camera: { focusX: 0.5, focusY: 0.5, scale: 1, tiltX: 0, tiltY: 0 }, tracksCursor: false };
    }
    let focus = clampFocusToScale(zoom.focus, zoom.scale);
    if (zoom.tracksCursor) {
      const rawCursor = cursorFocusAt(sortedTelemetry, inputs.mapTelemetryTime?.(timeMs) ?? timeMs);
      const cursor = rawCursor ? (inputs.mapFocus?.(rawCursor, zoom, timeMs) ?? rawCursor) : null;
      focus = updateAutoFollowTarget(autoFollow, cursor, focus, zoom.scale, zoom.strength, timeMs);
    } else updateAutoFollowTarget(autoFollow, null, focus, zoom.scale, 0, timeMs);
    const tilt = cameraTiltForControls(
      zoom.tilt,
      zoom.tiltHorizontal ?? DEFAULT_ZOOM_TILT_HORIZONTAL,
      zoom.tiltVertical ?? DEFAULT_ZOOM_TILT_VERTICAL,
    );
    return {
      camera: { focusX: focus.cx, focusY: focus.cy, scale: zoom.scale, ...tilt },
      tracksCursor: zoom.tracksCursor === true,
    };
  };
  const initialState = (): SimulationState => {
    const autoFollow = createAutoFollowState(autoFollowSettings);
    return { camera: targetAt(0, autoFollow).camera, velocity: createCameraVelocity(), autoFollow };
  };
  const reset = () => {
    checkpoints.clear();
    checkpoints.set(0, initialState());
  };
  reset();

  const stateAtStep = (targetStep: number) => {
    const checkpointStep = Math.floor(targetStep / CHECKPOINT_STEPS) * CHECKPOINT_STEPS;
    let startStep = checkpointStep;
    while (startStep > 0 && !checkpoints.has(startStep)) startStep -= CHECKPOINT_STEPS;
    let state = cloneState(checkpoints.get(startStep) ?? initialState());
    for (let step = startStep + 1; step <= targetStep; step += 1) {
      const target = targetAt(step * STEP_MS, state.autoFollow);
      state.camera = stepCameraSpring(
        state.camera,
        target.camera,
        state.velocity,
        STEP_MS,
        target.tracksCursor ? cameraSpringOmega(autoFollowSettings.responsiveness) : undefined,
      );
      if (step % CHECKPOINT_STEPS === 0) checkpoints.set(step, cloneState(state));
    }
    return state.camera;
  };

  return {
    sample(timeMs) {
      const time = Math.max(0, Number.isFinite(timeMs) ? timeMs : 0);
      const lowerStep = Math.floor(time / STEP_MS);
      const progress = time / STEP_MS - lowerStep;
      const lower = stateAtStep(lowerStep);
      if (progress <= 0.000_000_1)
        return {
          focus: { cx: lower.focusX, cy: lower.focusY },
          scale: lower.scale,
          tiltX: lower.tiltX ?? 0,
          tiltY: lower.tiltY ?? 0,
        };
      const upper = stateAtStep(lowerStep + 1);
      const mix = (left: number, right: number) => left + (right - left) * progress;
      return {
        focus: { cx: mix(lower.focusX, upper.focusX), cy: mix(lower.focusY, upper.focusY) },
        scale: mix(lower.scale, upper.scale),
        tiltX: mix(lower.tiltX ?? 0, upper.tiltX ?? 0),
        tiltY: mix(lower.tiltY ?? 0, upper.tiltY ?? 0),
      };
    },
    invalidate: reset,
  };
}

export const CAMERA_SIMULATION_HZ = 120;
export const CAMERA_CHECKPOINT_MS = 250;
