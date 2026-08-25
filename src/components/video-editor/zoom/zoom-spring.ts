export interface CameraTransform {
  focusX: number;
  focusY: number;
  scale: number;
  tiltX?: number;
  tiltY?: number;
}
export interface CameraVelocity extends CameraTransform {}

export const createCameraVelocity = (): CameraVelocity => ({ focusX: 0, focusY: 0, scale: 0, tiltX: 0, tiltY: 0 });

function stepCritical(current: number, target: number, velocity: number, deltaSeconds: number, omega = 10) {
  const displacement = current - target;
  const decay = Math.exp(-omega * deltaSeconds);
  const nextDisplacement = (displacement + (velocity + omega * displacement) * deltaSeconds) * decay;
  return {
    value: target + nextDisplacement,
    velocity: (velocity - omega * (velocity + omega * displacement) * deltaSeconds) * decay,
  };
}

export function stepCameraSpring(
  current: CameraTransform,
  target: CameraTransform,
  velocity: CameraVelocity,
  deltaMs: number,
): CameraTransform {
  const dt = Math.min(0.08, Math.max(0.001, deltaMs / 1000));
  const x = stepCritical(current.focusX, target.focusX, velocity.focusX, dt);
  const y = stepCritical(current.focusY, target.focusY, velocity.focusY, dt);
  const scale = stepCritical(current.scale, target.scale, velocity.scale, dt);
  const tiltX = stepCritical(current.tiltX ?? 0, target.tiltX ?? 0, velocity.tiltX ?? 0, dt, 7);
  const tiltY = stepCritical(current.tiltY ?? 0, target.tiltY ?? 0, velocity.tiltY ?? 0, dt, 7);
  velocity.focusX = x.velocity;
  velocity.focusY = y.velocity;
  velocity.scale = scale.velocity;
  velocity.tiltX = tiltX.velocity;
  velocity.tiltY = tiltY.velocity;
  return { focusX: x.value, focusY: y.value, scale: scale.value, tiltX: tiltX.value, tiltY: tiltY.value };
}
