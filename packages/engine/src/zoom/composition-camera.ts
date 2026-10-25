import type {
  CameraCheckpointReuse,
  CompositionCameraEvaluator,
  CompositionCameraInputs,
  CameraSimulationState as SimulationState,
} from './composition-camera-types';
import { createCameraVelocity, stepCameraSpring, type CameraTransform } from '@beam/engine/zoom/zoom-spring';
import { clampFocusToScale, createZoomTimeEvaluator, cursorFocusAt } from '@beam/engine/zoom/zoom-playback';
import { cameraSpringOmega, createAutoFollowState, updateAutoFollowTarget } from '@beam/engine/zoom/auto-follow-camera';
import {
  DEFAULT_ZOOM_TILT_HORIZONTAL,
  DEFAULT_ZOOM_TILT_VERTICAL,
  DEFAULT_ZOOM_AUTO_FOLLOW,
  normalizeZoomAutoFollow,
} from '@beam/engine/zoom/zoom-types';
import { orbitCameraPose } from './orbit-camera';
import { connectedCameraFocus } from './camera-connection';
import { createAutomaticFollowGate } from './camera-follow-gate';
import { createCameraFollowCursor } from './camera-follow-cursor';
export type { CameraSample, CompositionCameraEvaluator, CompositionCameraInputs } from './composition-camera-types';

const STEP_MS = 1_000 / 120;
const CHECKPOINT_STEPS = 30;
const retainedCheckpoints = new WeakMap<CompositionCameraEvaluator, ReadonlyMap<number, SimulationState>>();
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
    direction: { ...state.autoFollow.direction },
    anchorCursor: { ...state.autoFollow.anchorCursor },
    anchorFocus: { ...state.autoFollow.anchorFocus },
    previousCursor: state.autoFollow.previousCursor ? { ...state.autoFollow.previousCursor } : null,
  },
  ...(state.connection
    ? { connection: { ...state.connection, from: { ...state.connection.from }, to: { ...state.connection.to } } }
    : {}),
});

export function createCompositionCameraEvaluator(
  inputs: CompositionCameraInputs,
  reuse?: CameraCheckpointReuse,
): CompositionCameraEvaluator {
  const checkpoints = new Map<number, SimulationState>();
  const zoomAt = createZoomTimeEvaluator(inputs.zooms, inputs.telemetry, inputs.mapFocus);
  const autoFollowSettings = normalizeZoomAutoFollow(inputs.autoFollow ?? DEFAULT_ZOOM_AUTO_FOLLOW);
  const sortedTelemetry = [...inputs.telemetry].sort((left, right) => left.timeMs - right.timeMs);
  const canFollow = createAutomaticFollowGate(inputs, sortedTelemetry);
  const followCursorAt = createCameraFollowCursor(inputs, sortedTelemetry, canFollow);
  const targetAt = (
    timeMs: number,
    state: SimulationState,
  ): { camera: Required<CameraTransform>; tracksCursor: boolean; cinematic?: boolean } => {
    const autoFollow = state.autoFollow;
    const zoom = zoomAt(timeMs);
    if (!zoom?.connection) state.connection = undefined;
    if (!zoom) {
      updateAutoFollowTarget(autoFollow, null, { cx: 0.5, cy: 0.5 }, 1, 0, timeMs);
      return { camera: { focusX: 0.5, focusY: 0.5, scale: 1, tiltX: 0, tiltY: 0 }, tracksCursor: false };
    }
    let focus = zoom.cinematic ? zoom.focus : clampFocusToScale(zoom.focus, zoom.scale);
    const connectedFollow =
      zoom.connection && (zoom.connection.from.mode === 'auto' || zoom.connection.to.mode === 'auto');
    if (connectedFollow) focus = connectedCameraFocus(state, zoom, timeMs, zoomAt, followCursorAt);
    else if (zoom.tracksCursor) {
      const entering = zoom.cinematic && !autoFollow.reachedFullZoom && zoom.strength < 0.99;
      const cursor = followCursorAt(zoom, timeMs);
      focus = updateAutoFollowTarget(autoFollow, cursor, focus, zoom.scale, zoom.strength, timeMs);
      if (entering) focus = zoom.focus;
    } else updateAutoFollowTarget(autoFollow, null, focus, zoom.scale, 0, timeMs);
    const tilt = cameraTiltForControls(
      zoom.tilt,
      zoom.tiltHorizontal ?? DEFAULT_ZOOM_TILT_HORIZONTAL,
      zoom.tiltVertical ?? DEFAULT_ZOOM_TILT_VERTICAL,
    );
    return {
      camera: { focusX: focus.cx, focusY: focus.cy, scale: zoom.scale, ...tilt },
      tracksCursor: connectedFollow || zoom.tracksCursor === true,
      cinematic: zoom.cinematic,
    };
  };
  const initialState = (): SimulationState => {
    const autoFollow = createAutoFollowState(autoFollowSettings);
    const state: SimulationState = {
      camera: { focusX: 0.5, focusY: 0.5, scale: 1, tiltX: 0, tiltY: 0 },
      velocity: createCameraVelocity(),
      autoFollow,
    };
    state.camera = targetAt(0, state).camera;
    return state;
  };
  const reset = () => {
    checkpoints.clear();
    checkpoints.set(0, initialState());
  };
  if (reuse) {
    // Stored states are immutable. Each simulation clones its starting state.
    // Keep only history strictly before the edit; never borrow a changed step.
    const before = Math.max(0, reuse.unchangedBeforeMs || 0) / STEP_MS;
    for (const [step, state] of retainedCheckpoints.get(reuse.previous) ?? [])
      if (step < before) checkpoints.set(step, state);
  }
  if (!checkpoints.has(0)) reset();

  const stateAtStep = (targetStep: number) => {
    const checkpointStep = Math.floor(targetStep / CHECKPOINT_STEPS) * CHECKPOINT_STEPS;
    let startStep = checkpointStep;
    while (startStep > 0 && !checkpoints.has(startStep)) startStep -= CHECKPOINT_STEPS;
    let state = cloneState(checkpoints.get(startStep)!);
    for (let step = startStep + 1; step <= targetStep; step += 1) {
      const target = targetAt(step * STEP_MS, state);
      // At identity the focus is visually unobservable. Aim before magnification makes
      // it visible; the threshold bounds any correction below 0.02 px on a 4K frame.
      if (target.cinematic && state.camera.scale <= 1.00001) {
        state.camera.focusX = target.camera.focusX;
        state.camera.focusY = target.camera.focusY;
        state.velocity.focusX = 0;
        state.velocity.focusY = 0;
      }
      state.camera = stepCameraSpring(
        state.camera,
        target.camera,
        state.velocity,
        STEP_MS,
        target.tracksCursor ? cameraSpringOmega(autoFollowSettings.responsiveness) : undefined,
      );
      if (target.cinematic) {
        state.camera.scale = target.camera.scale;
        state.velocity.scale = 0;
      }
      if (step % CHECKPOINT_STEPS === 0) checkpoints.set(step, cloneState(state));
    }
    return state;
  };

  const evaluator: CompositionCameraEvaluator = {
    sample(timeMs) {
      const time = Math.max(0, Number.isFinite(timeMs) ? timeMs : 0);
      const lowerStep = Math.floor(time / STEP_MS);
      const progress = time / STEP_MS - lowerStep;
      const lowerState = stateAtStep(lowerStep);
      const lower = lowerState.camera;
      const zoom = zoomAt(time);
      const orbit = zoom?.orbit
        ? orbitCameraPose({
            timeMs: time,
            weight: zoom.orbit,
            intensity: 1,
            scale: zoom.scale,
            settings: zoom.orbitSettings,
            ...(zoom.mode === 'manual' ? { fixed: zoom.focus } : {}),
            pointAt: (at) => {
              const point = cursorFocusAt(sortedTelemetry, inputs.mapTelemetryTime?.(at) ?? at);
              return point ? (inputs.mapFocus?.(point, zoom, at) ?? point) : null;
            },
          })
        : undefined;
      if (progress <= 0.000_000_1)
        return {
          focus: clampFocusToScale({ cx: lower.focusX, cy: lower.focusY }, zoom?.cinematic ? zoom.scale : lower.scale),
          scale: zoom?.cinematic ? zoom.scale : lower.scale,
          tiltX: lower.tiltX,
          tiltY: lower.tiltY,
          ...(orbit ? { orbit } : {}),
        };
      const upperState = stateAtStep(lowerStep + 1);
      const upper = upperState.camera;
      // Hermite interpolation preserves the spring's velocity between fixed
      // simulation ticks. Linear interpolation introduces a speed jump at 120 Hz.
      const mix = (left: number, right: number, leftVelocity: number, rightVelocity: number) => {
        const p2 = progress * progress,
          p3 = p2 * progress;
        return (
          (2 * p3 - 3 * p2 + 1) * left +
          (((p3 - 2 * p2 + progress) * STEP_MS) / 1000) * leftVelocity +
          (-2 * p3 + 3 * p2) * right +
          (((p3 - p2) * STEP_MS) / 1000) * rightVelocity
        );
      };
      const velocity = lowerState.velocity,
        nextVelocity = upperState.velocity;
      const scale = zoom?.cinematic ? zoom.scale : mix(lower.scale, upper.scale, velocity.scale, nextVelocity.scale);
      return {
        focus: clampFocusToScale(
          {
            cx: mix(lower.focusX, upper.focusX, velocity.focusX, nextVelocity.focusX),
            cy: mix(lower.focusY, upper.focusY, velocity.focusY, nextVelocity.focusY),
          },
          scale,
        ),
        scale,
        tiltX: mix(lower.tiltX, upper.tiltX, velocity.tiltX ?? 0, nextVelocity.tiltX ?? 0),
        tiltY: mix(lower.tiltY, upper.tiltY, velocity.tiltY ?? 0, nextVelocity.tiltY ?? 0),
        ...(orbit ? { orbit } : {}),
      };
    },
    invalidate: reset,
  };
  retainedCheckpoints.set(evaluator, checkpoints);
  return evaluator;
}

export const CAMERA_SIMULATION_HZ = 120;
export const CAMERA_CHECKPOINT_MS = 250;
