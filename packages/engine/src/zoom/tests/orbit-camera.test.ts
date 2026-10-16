import { expect, it } from 'vitest';
import { orbitCameraPose, orbitCameraPoint, orbitCameraCoverScale } from '../orbit-camera';
import { createCompositionCameraEvaluator } from '../composition-camera';
import {
  createPerspectiveGeometry,
  projectPerspectivePoint,
  unprojectPerspectivePoint,
  hasPerspectiveTilt,
} from '../perspective-projection';
const base = { timeMs: 6000, weight: 1, intensity: 1, scale: 1.8, pointAt: () => ({ cx: 0.8, cy: 0.2 }) };
it('respects the orbit intensity slider throughout preview and export sampling', () => {
  const zoom = {
    id: 'orbit',
    sessionId: 'take',
    mode: 'manual' as const,
    startMs: 5000,
    endMs: 9000,
    depth: 3 as const,
    focus: { cx: 0.8, cy: 0.2 },
    projection: 'orbit' as const,
    transition: 'cinematic' as const,
  };
  const full = createCompositionCameraEvaluator({ zooms: [{ ...zoom, tiltIntensity: 1 }], telemetry: [] }).sample(6000);
  const quarter = createCompositionCameraEvaluator({ zooms: [{ ...zoom, tiltIntensity: 0.25 }], telemetry: [] }).sample(
    6000,
  );
  expect(quarter.orbit!.azimuth).toBeCloseTo(full.orbit!.azimuth * 0.25, 12);
  expect(quarter.orbit!.strength).toBe(0.25);
  expect(
    createCompositionCameraEvaluator({ zooms: [{ ...zoom, tiltIntensity: 0 }], telemetry: [] }).sample(6000).orbit,
  ).toBeUndefined();
});
it('uses a real eye position while keeping the framed origin fixed', () => {
  const pose = orbitCameraPose(base),
    point = orbitCameraPoint(0, 0, 0, 16 / 9, pose);
  expect(point.x).toBeCloseTo(0, 12);
  expect(point.y).toBeCloseTo(0, 12);
  expect(point.w).toBeCloseTo(1, 12);
  expect(pose.azimuth).toBeGreaterThan(0);
  expect(pose.elevation).toBeGreaterThan(0);
});
it('returns the wide identity at zero weight and bounds excessive intensity', () => {
  const pose = orbitCameraPose({ ...base, weight: 0 });
  expect(pose.strength).toBe(0);
  expect(orbitCameraCoverScale(2, pose)).toBe(1);
  expect(orbitCameraPose({ ...base, intensity: 10 })).toEqual(orbitCameraPose(base));
  expect(orbitCameraPose({ ...base, weight: -1 }).strength).toBe(0);
});
it('uses a fixed manual target without consulting telemetry', () => {
  const pose = orbitCameraPose({
    ...base,
    fixed: { cx: 0, cy: 1 },
    pointAt: () => {
      throw Error('not used');
    },
  });
  expect(pose.azimuth).toBe(0);
  expect(pose.elevation).toBeCloseTo((4 * Math.PI) / 180);
});
it('is deterministic across reverse seeks and hidden or absent telemetry', () => {
  const options = { ...base, pointAt: (t: number) => (t < 5000 ? null : { cx: 0.75, cy: 0.4 }) };
  const pose = orbitCameraPose(options);
  orbitCameraPose({ ...options, timeMs: 50000 });
  expect(orbitCameraPose(options)).toEqual(pose);
  const absent = orbitCameraPose({ ...base, timeMs: 0, pointAt: () => null });
  expect(absent.azimuth).toBe(0);
  expect(absent.elevation).toBeCloseTo((4 * Math.PI) / 180);
});
it.each([0.3, 1, 16 / 9, 32 / 9, 100])(
  'round trips viewport points with contained 3D framing at aspect %s',
  (aspect) => {
    const bounds = { x: 120, y: 80, width: 1080 * aspect, height: 1080 };
    for (const cx of [0, 0.5, 1])
      for (const cy of [0, 0.5, 1])
        for (const strength of [0, 0.1, 0.6, 1]) {
          const orbit = orbitCameraPose({ ...base, weight: strength, fixed: { cx, cy } }),
            transform = { tiltX: 0, tiltY: 0, orbit };
          const geometry = createPerspectiveGeometry(bounds.width, bounds.height, transform);
          expect(Array.from(geometry.positions).every(Number.isFinite)).toBe(true);
          for (const x of [0, 1])
            for (const y of [0, 1]) {
              const viewport = { x: bounds.x + x * bounds.width, y: bounds.y + y * bounds.height };
              const world = unprojectPerspectivePoint(viewport, bounds, transform, geometry.coverScale);
              const restored = projectPerspectivePoint(world, bounds, transform, geometry.coverScale);
              expect(restored.x).toBeCloseTo(viewport.x, 5);
              expect(restored.y).toBeCloseTo(viewport.y, 5);
            }
          expect(hasPerspectiveTilt(transform)).toBe(strength > 0);
        }
  },
);
it('keeps cover stable when the subject moves instead of making the zoom breathe', () => {
  const scales = [0, 0.25, 0.5, 0.75, 1].map((cx) =>
    orbitCameraCoverScale(16 / 9, orbitCameraPose({ ...base, fixed: { cx, cy: 0.5 } })),
  );
  expect(new Set(scales).size).toBe(1);
});

it('reads older poses without optional roll or envelope metadata and guards the near plane', () => {
  const legacy = { azimuth: 0.2, elevation: -0.1, distance: 2, strength: 1 };
  expect(orbitCameraPoint(0, 0, 0, 2, legacy).w).toBeCloseTo(1, 12);
  expect(orbitCameraCoverScale(2, legacy)).toBeLessThan(1);
  const fit = { ...legacy, pullback: 0.4 };
  expect(orbitCameraCoverScale(2, fit)).toBeLessThan(1);
  expect(orbitCameraPoint(0, 0, 1000, 2, legacy).w).toBeLessThan(0);
});
