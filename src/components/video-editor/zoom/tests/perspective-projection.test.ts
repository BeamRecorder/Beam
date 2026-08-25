import { describe, expect, it } from 'vitest';
import {
  createPerspectiveGeometry,
  hasPerspectiveTilt,
  perspectiveCoverScale,
  projectPerspectivePoint,
  unprojectPerspectivePoint,
} from '../perspective-projection';
import { cameraTiltForControls } from '../composition-camera';

const identity = { tiltX: 0, tiltY: 0 };
const PROJECTION_MAX_TILT = (65 * Math.PI) / 180;

describe('perspective projection geometry', () => {
  const bounds = { x: 120, y: 80, width: 1_920, height: 1_080 };
  const points = [
    { x: bounds.x, y: bounds.y },
    { x: bounds.x + bounds.width, y: bounds.y },
    { x: bounds.x + bounds.width, y: bounds.y + bounds.height },
    { x: bounds.x, y: bounds.y + bounds.height },
    { x: bounds.x + bounds.width * 0.37, y: bounds.y + bounds.height * 0.62 },
  ];

  it('round-trips multiple points through the identity projection', () => {
    const coverScale = perspectiveCoverScale(bounds.width, bounds.height, identity);

    for (const point of points) {
      const projected = projectPerspectivePoint(point, bounds, identity, coverScale);
      const restored = unprojectPerspectivePoint(projected, bounds, identity, coverScale);

      expect(restored.x).toBeCloseTo(point.x, 10);
      expect(restored.y).toBeCloseTo(point.y, 10);
    }
  });

  it('round-trips multiple points at strong tilt with the compositor cover scale', () => {
    const transform = { tiltX: PROJECTION_MAX_TILT, tiltY: -PROJECTION_MAX_TILT };
    const geometry = createPerspectiveGeometry(bounds.width, bounds.height, transform);

    for (const point of points) {
      const projected = projectPerspectivePoint(point, bounds, transform, geometry.coverScale);
      const restored = unprojectPerspectivePoint(projected, bounds, transform, geometry.coverScale);

      expect(restored.x).toBeCloseTo(point.x, 7);
      expect(restored.y).toBeCloseTo(point.y, 7);
    }
  });

  it('keeps the identity projection unchanged', () => {
    const geometry = createPerspectiveGeometry(1_920, 1_080, identity);

    expect(geometry.coverScale).toBe(1);
    expect(Array.from(geometry.positions)).toEqual([-1, 1, 0, 1, -1, -1, 0, 1, 1, 1, 0, 1, 1, -1, 0, 1]);
    expect(projectPerspectivePoint({ x: 480, y: 270 }, { x: 0, y: 0, width: 1_920, height: 1_080 }, identity)).toEqual({
      x: 480,
      y: 270,
    });
    expect(hasPerspectiveTilt(identity)).toBe(false);
  });

  it('returns a finite, covered geometry for extreme and invalid tilt input', () => {
    const transform = { tiltX: Number.POSITIVE_INFINITY, tiltY: Number.NaN };
    const geometry = createPerspectiveGeometry(1_920, 1_080, transform);

    expect(Number.isFinite(geometry.coverScale)).toBe(true);
    expect(geometry.coverScale).toBeGreaterThanOrEqual(1);
    expect(Array.from(geometry.positions).every(Number.isFinite)).toBe(true);
    expect(
      projectPerspectivePoint(
        { x: 1_920, y: 1_080 },
        { x: 0, y: 0, width: 1_920, height: 1_080 },
        transform,
        geometry.coverScale,
      ),
    ).toEqual({ x: 1_920, y: 1_080 });
  });

  it('expands the source enough to cover the viewport under perspective tilt', () => {
    const transform = { tiltX: Math.PI / 9, tiltY: -Math.PI / 10 };
    const coverScale = perspectiveCoverScale(1_920, 1_080, transform);
    const geometry = createPerspectiveGeometry(1_920, 1_080, transform);

    expect(coverScale).toBeGreaterThan(1);
    expect(coverScale).toBeLessThan(4);
    expect(geometry.coverScale).toBeCloseTo(coverScale, 12);
    expect(hasPerspectiveTilt(transform)).toBe(true);
  });

  it.each([
    ['positive horizontal axis', cameraTiltForControls(1, 1, 0)],
    ['negative horizontal axis', cameraTiltForControls(1, -1, 0)],
    ['positive vertical axis', cameraTiltForControls(1, 0, 1)],
    ['negative vertical axis', cameraTiltForControls(1, 0, -1)],
    ['positive diagonal', cameraTiltForControls(1, 1, 1)],
    ['mixed diagonal', cameraTiltForControls(1, 1, -1)],
    ['opposite mixed diagonal', cameraTiltForControls(1, -1, 1)],
    ['negative diagonal', cameraTiltForControls(1, -1, -1)],
  ])('keeps %s geometry finite and covered at the 62° manual limit', (_label, transform) => {
    const geometry = createPerspectiveGeometry(1_920, 1_080, transform);
    const corners = [
      { x: 0, y: 0 },
      { x: 1_920, y: 0 },
      { x: 0, y: 1_080 },
      { x: 1_920, y: 1_080 },
    ];

    expect(geometry.coverScale).toBeGreaterThanOrEqual(1);
    expect(geometry.coverScale).toBeLessThanOrEqual(4);
    expect(Array.from(geometry.positions).every(Number.isFinite)).toBe(true);
    expect(
      corners.every((corner) => {
        const projected = projectPerspectivePoint(
          corner,
          { x: 0, y: 0, width: 1_920, height: 1_080 },
          transform,
          geometry.coverScale,
        );
        return Number.isFinite(projected.x) && Number.isFinite(projected.y);
      }),
    ).toBe(true);
  });

  it('clamps manual values above 65° without changing the finite projection', () => {
    const safe = createPerspectiveGeometry(1_920, 1_080, {
      tiltX: PROJECTION_MAX_TILT,
      tiltY: -PROJECTION_MAX_TILT,
    });
    const extreme = createPerspectiveGeometry(1_920, 1_080, {
      tiltX: Math.PI,
      tiltY: -Math.PI,
    });

    expect(extreme.coverScale).toBeCloseTo(safe.coverScale, 12);
    expect(extreme.positions).toHaveLength(safe.positions.length);
    for (let index = 0; index < safe.positions.length; index += 1) {
      expect(Number.isFinite(extreme.positions[index])).toBe(true);
      expect(extreme.positions[index]).toBeCloseTo(safe.positions[index]!, 6);
    }
    expect(Array.from(extreme.positions).some(Number.isNaN)).toBe(false);
  });

  it('clamps tilt while preserving finite output for degenerate viewport values', () => {
    const geometry = createPerspectiveGeometry(0, 0, {
      tiltX: 100,
      tiltY: -100,
    });

    expect(Number.isFinite(geometry.coverScale)).toBe(true);
    expect(Array.from(geometry.positions).every(Number.isFinite)).toBe(true);
  });
});
