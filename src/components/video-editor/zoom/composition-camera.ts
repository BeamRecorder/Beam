import type { CursorTelemetryPoint } from '../../../api/types/capture-session';
import { createCameraVelocity, stepCameraSpring, type CameraTransform, type CameraVelocity } from './zoom-spring';
import { clampFocusToScale, createZoomTimeEvaluator, type AppliedZoom } from './zoom-playback';
import type { ZoomElement, ZoomFocus } from './zoom-types';

export interface CameraSample {
  focus: ZoomFocus;
  scale: number;
}

export interface CompositionCameraEvaluator {
  sample(timeMs: number): CameraSample;
  invalidate(): void;
}

export interface CompositionCameraInputs {
  zooms: readonly ZoomElement[];
  telemetry: readonly CursorTelemetryPoint[];
  mapFocus?: (focus: ZoomFocus, zoom: AppliedZoom, timeMs: number) => ZoomFocus;
}

interface SimulationState {
  camera: CameraTransform;
  velocity: CameraVelocity;
}

const STEP_MS = 1_000 / 120;
const CHECKPOINT_STEPS = 30;
const cloneState = (state: SimulationState): SimulationState => ({
  camera: { ...state.camera },
  velocity: { ...state.velocity },
});

export function createCompositionCameraEvaluator(inputs: CompositionCameraInputs): CompositionCameraEvaluator {
  const checkpoints = new Map<number, SimulationState>();
  const zoomAt = createZoomTimeEvaluator(inputs.zooms, inputs.telemetry);
  const targetAt = (timeMs: number): CameraTransform => {
    const zoom = zoomAt(timeMs);
    if (!zoom) return { focusX: 0.5, focusY: 0.5, scale: 1 };
    const mapped = inputs.mapFocus ? inputs.mapFocus(zoom.focus, zoom, timeMs) : zoom.focus;
    const focus = clampFocusToScale(mapped, zoom.scale);
    return { focusX: focus.cx, focusY: focus.cy, scale: zoom.scale };
  };
  const initialState = (): SimulationState => ({ camera: targetAt(0), velocity: createCameraVelocity() });
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
      state.camera = stepCameraSpring(state.camera, targetAt(step * STEP_MS), state.velocity, STEP_MS);
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
      if (progress <= 0.000_000_1) return { focus: { cx: lower.focusX, cy: lower.focusY }, scale: lower.scale };
      const upper = stateAtStep(lowerStep + 1);
      const mix = (left: number, right: number) => left + (right - left) * progress;
      return {
        focus: { cx: mix(lower.focusX, upper.focusX), cy: mix(lower.focusY, upper.focusY) },
        scale: mix(lower.scale, upper.scale),
      };
    },
    invalidate: reset,
  };
}

export const CAMERA_SIMULATION_HZ = 120;
export const CAMERA_CHECKPOINT_MS = 250;
