import type { CursorMotionSettings } from '../../../api/types/cursor-settings';

interface Point {
  x: number;
  y: number;
}

interface SpringAxisState {
  position: number;
  velocity: number;
}

interface SimulationState {
  x: SpringAxisState;
  y: SpringAxisState;
}

export interface CursorMotionEvaluation {
  x: number;
  y: number;
  previousX: number;
  previousY: number;
  deltaSeconds: number;
}

interface CursorMotionEvaluatorInputs {
  settings: CursorMotionSettings;
  targetAt: (timeSeconds: number) => Point | null;
  directTargetAt: (timeSeconds: number) => Point | null;
  isDraggingAt: (timeSeconds: number) => boolean;
  buttonTimes: readonly number[];
}

const STEP_SECONDS = 1 / 120;
const CHECKPOINT_STEPS = 30;
const VELOCITY_WINDOW_SECONDS = 1 / 60;
const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));
const clamp01 = (value: number) => clamp(value, 0, 1);

const springParameters = (settings: CursorMotionSettings) => {
  const mass = clamp(settings.springMassMultiplier, 0.5, 2);
  const stiffness = 420 - 300 * clamp(settings.smoothing, 0, 1);
  const dampingRatio = 0.82 + clamp(settings.smoothing, 0, 1) * 0.42;
  return { mass, stiffness, damping: 2 * Math.sqrt(stiffness * mass) * dampingRatio };
};

export function stepSpringAxis(
  state: SpringAxisState,
  target: number,
  deltaSeconds: number,
  settings: CursorMotionSettings,
): SpringAxisState {
  return stepSpringAxisFollowingTarget(state, target, target, deltaSeconds, settings);
}

/**
 * Follows a target moving linearly over the current step. Damping relative to
 * target velocity avoids the permanent trailing offset of a classic spring.
 */
function stepSpringAxisFollowingTarget(
  state: SpringAxisState,
  previousTarget: number,
  target: number,
  deltaSeconds: number,
  settings: CursorMotionSettings,
): SpringAxisState {
  const dt = clamp(deltaSeconds, 0, 0.1);
  if (dt <= 0) return state;
  const { mass, stiffness, damping } = springParameters(settings);
  const omega0 = Math.sqrt(stiffness / mass);
  const zeta = damping / (2 * Math.sqrt(stiffness * mass));
  const targetVelocity = (target - previousTarget) / dt;
  const displacement = state.position - previousTarget;
  const relativeVelocity = state.velocity - targetVelocity;
  let nextDisplacement: number;
  let nextRelativeVelocity: number;
  if (zeta < 1 - 0.0001) {
    const omegaD = omega0 * Math.sqrt(1 - zeta * zeta);
    const a = displacement;
    const b = (relativeVelocity + zeta * omega0 * displacement) / omegaD;
    const decay = Math.exp(-zeta * omega0 * dt);
    const cosine = Math.cos(omegaD * dt);
    const sine = Math.sin(omegaD * dt);
    nextDisplacement = decay * (a * cosine + b * sine);
    nextRelativeVelocity = decay * (-a * omegaD * sine + b * omegaD * cosine - omega0 * zeta * (a * cosine + b * sine));
  } else if (Math.abs(zeta - 1) <= 0.0001) {
    const decay = Math.exp(-omega0 * dt);
    const b = relativeVelocity + omega0 * displacement;
    nextDisplacement = decay * (displacement + b * dt);
    nextRelativeVelocity = decay * (relativeVelocity - omega0 * b * dt);
  } else {
    const root = Math.sqrt(zeta * zeta - 1);
    const firstRoot = -omega0 * (zeta - root);
    const secondRoot = -omega0 * (zeta + root);
    const firstCoefficient = (relativeVelocity - secondRoot * displacement) / (firstRoot - secondRoot);
    const secondCoefficient = displacement - firstCoefficient;
    const first = firstCoefficient * Math.exp(firstRoot * dt);
    const second = secondCoefficient * Math.exp(secondRoot * dt);
    nextDisplacement = first + second;
    nextRelativeVelocity = firstRoot * first + secondRoot * second;
  }
  const position = clamp01(target + nextDisplacement);
  const velocity = targetVelocity + nextRelativeVelocity;
  return { position, velocity: position === target + nextDisplacement ? velocity : 0 };
}

const cloneState = (state: SimulationState): SimulationState => ({
  x: { ...state.x },
  y: { ...state.y },
});

export function createDeterministicCursorMotionEvaluator(inputs: CursorMotionEvaluatorInputs) {
  const buttonSteps = new Set(inputs.buttonTimes.map((time) => Math.max(1, Math.ceil(time / STEP_SECONDS))));
  const initialPoint = inputs.directTargetAt(0) ?? inputs.targetAt(0) ?? { x: 0, y: 0 };
  const initialState = (): SimulationState => ({
    x: { position: initialPoint.x, velocity: 0 },
    y: { position: initialPoint.y, velocity: 0 },
  });
  const checkpoints = new Map<number, SimulationState>();

  const reset = () => {
    checkpoints.clear();
    checkpoints.set(0, initialState());
  };
  reset();

  const stateAtStep = (targetStep: number) => {
    let startStep = Math.floor(targetStep / CHECKPOINT_STEPS) * CHECKPOINT_STEPS;
    while (startStep > 0 && !checkpoints.has(startStep)) startStep -= CHECKPOINT_STEPS;
    let state = cloneState(checkpoints.get(startStep) ?? initialState());
    for (let step = startStep + 1; step <= targetStep; step += 1) {
      const time = step * STEP_SECONDS;
      const previousTime = (step - 1) * STEP_SECONDS;
      const direct = inputs.isDraggingAt(time) ? inputs.directTargetAt(time) : null;
      const target = direct ?? inputs.targetAt(time) ?? { x: state.x.position, y: state.y.position };
      if (direct || buttonSteps.has(step)) {
        state = {
          x: { position: target.x, velocity: 0 },
          y: { position: target.y, velocity: 0 },
        };
      } else {
        const previousTarget = inputs.targetAt(previousTime) ?? target;
        state.x = stepSpringAxisFollowingTarget(state.x, previousTarget.x, target.x, STEP_SECONDS, inputs.settings);
        state.y = stepSpringAxisFollowingTarget(state.y, previousTarget.y, target.y, STEP_SECONDS, inputs.settings);
      }
      if (step % CHECKPOINT_STEPS === 0) checkpoints.set(step, cloneState(state));
    }
    return state;
  };

  const pointAt = (timeSeconds: number): Point => {
    const time = Math.max(0, Number.isFinite(timeSeconds) ? timeSeconds : 0);
    if (inputs.settings.smoothing <= 0) return inputs.directTargetAt(time) ?? inputs.targetAt(time) ?? { x: 0, y: 0 };
    const lowerStep = Math.floor(time / STEP_SECONDS);
    const progress = time / STEP_SECONDS - lowerStep;
    const lower = stateAtStep(lowerStep);
    if (progress <= 0.000_000_1) return { x: lower.x.position, y: lower.y.position };
    const upper = stateAtStep(lowerStep + 1);
    return {
      x: lower.x.position + (upper.x.position - lower.x.position) * progress,
      y: lower.y.position + (upper.y.position - lower.y.position) * progress,
    };
  };

  return {
    sample(timeSeconds: number): CursorMotionEvaluation {
      const time = Math.max(0, Number.isFinite(timeSeconds) ? timeSeconds : 0);
      const previousTime = Math.max(0, time - VELOCITY_WINDOW_SECONDS);
      const current = pointAt(time);
      const previous = pointAt(previousTime);
      return {
        ...current,
        previousX: previous.x,
        previousY: previous.y,
        deltaSeconds: time - previousTime,
      };
    },
    reset,
  };
}

export const CURSOR_MOTION_SIMULATION_HZ = 120;
