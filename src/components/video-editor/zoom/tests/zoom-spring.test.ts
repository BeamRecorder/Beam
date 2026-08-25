import { describe, expect, it } from 'vitest';
import { createCameraVelocity, stepCameraSpring, type CameraTransform } from '../zoom-spring';

describe('camera spring', () => {
  it('moves toward the target without overshoot', () => {
    const velocity = createCameraVelocity();
    const result = stepCameraSpring(
      { focusX: 0, focusY: 0, scale: 1 },
      { focusX: 1, focusY: 1, scale: 2 },
      velocity,
      16,
    );
    expect(result.focusX).toBeGreaterThan(0);
    expect(result.focusX).toBeLessThan(1);
    expect(result.scale).toBeGreaterThan(1);
  });
  it('is stable for a large frame delta', () =>
    expect(
      stepCameraSpring(
        { focusX: 0, focusY: 0, scale: 1 },
        { focusX: 1, focusY: 1, scale: 2 },
        createCameraVelocity(),
        500,
      ).scale,
    ).toBeLessThanOrEqual(2));
  it('keeps a settled camera stationary', () =>
    expect(
      stepCameraSpring(
        { focusX: 0.5, focusY: 0.5, scale: 2 },
        { focusX: 0.5, focusY: 0.5, scale: 2 },
        createCameraVelocity(),
        16,
      ),
    ).toEqual({ focusX: 0.5, focusY: 0.5, scale: 2, tiltX: 0, tiltY: 0 }));

  it('springs tilt axes toward the target without overshoot', () => {
    const velocity = createCameraVelocity();
    const result = stepCameraSpring(
      { focusX: 0.5, focusY: 0.5, scale: 1, tiltX: -0.2, tiltY: 0.2 },
      { focusX: 0.5, focusY: 0.5, scale: 1, tiltX: 0.4, tiltY: -0.4 },
      velocity,
      16,
    );

    expect(result.tiltX).toBeGreaterThan(-0.2);
    expect(result.tiltX).toBeLessThan(0.4);
    expect(result.tiltY).toBeLessThan(0.2);
    expect(result.tiltY).toBeGreaterThan(-0.4);
    expect(Number.isFinite(velocity.tiltX)).toBe(true);
    expect(Number.isFinite(velocity.tiltY)).toBe(true);
  });

  it('uses a softer tilt response than focus and scale for the same normalized displacement', () => {
    const result = stepCameraSpring(
      { focusX: 0, focusY: 0, scale: 1, tiltX: 0, tiltY: 0 },
      { focusX: 1, focusY: 1, scale: 2, tiltX: 0.5, tiltY: -0.5 },
      createCameraVelocity(),
      16,
    );

    const focusProgress = result.focusX;
    const scaleProgress = result.scale - 1;
    const tiltProgressX = (result.tiltX ?? 0) / 0.5;
    const tiltProgressY = (result.tiltY ?? 0) / -0.5;
    expect(tiltProgressX).toBeGreaterThan(0);
    expect(tiltProgressY).toBeGreaterThan(0);
    expect(tiltProgressX).toBeLessThan(focusProgress);
    expect(tiltProgressY).toBeLessThan(focusProgress);
    expect(tiltProgressX).toBeLessThan(scaleProgress);
    expect(tiltProgressY).toBeLessThan(scaleProgress);
  });

  it('keeps a soft tilt trajectory continuous, monotonic, and convergent', () => {
    const velocity = createCameraVelocity();
    let current: CameraTransform = { focusX: 0.5, focusY: 0.5, scale: 1, tiltX: -0.2, tiltY: 0.2 };
    let previousTiltX = current.tiltX ?? 0;
    let previousTiltY = current.tiltY ?? 0;

    for (let frame = 0; frame < 240; frame += 1) {
      current = stepCameraSpring(
        current,
        { focusX: 0.5, focusY: 0.5, scale: 1, tiltX: 0.4, tiltY: -0.4 },
        velocity,
        1_000 / 120,
      );
      expect(current.tiltX ?? 0).toBeGreaterThanOrEqual(previousTiltX);
      expect(current.tiltY ?? 0).toBeLessThanOrEqual(previousTiltY);
      expect(current.tiltX ?? 0).toBeLessThanOrEqual(0.4);
      expect(current.tiltY ?? 0).toBeGreaterThanOrEqual(-0.4);
      expect(Math.abs((current.tiltX ?? 0) - previousTiltX)).toBeLessThan(0.1);
      expect(Math.abs((current.tiltY ?? 0) - previousTiltY)).toBeLessThan(0.1);
      previousTiltX = current.tiltX ?? previousTiltX;
      previousTiltY = current.tiltY ?? previousTiltY;
    }

    expect(current.tiltX ?? 0).toBeCloseTo(0.4, 4);
    expect(current.tiltY ?? 0).toBeCloseTo(-0.4, 4);
  });
});
