import { expect, it } from 'vitest';
import { ORBIT_PRESETS, DEFAULT_ORBIT_SETTINGS } from '../orbit-settings';
import { orbitCameraPose, orbitCameraCoverScale } from '../orbit-camera';
import {
  createPerspectiveGeometry,
  projectPerspectivePoint,
  unprojectPerspectivePoint,
} from '../perspective-projection';

it.each([1, 16 / 9, 21 / 9])('keeps small text near the action readable in Dynamic on aspect %s', (aspect) => {
  const settings = ORBIT_PRESETS.find((p) => p.id === 'dynamic')!.settings;
  const bounds = { x: 0, y: 0, width: 1080 * aspect, height: 1080 };
  for (const cx of [0, 0.25, 0.5, 0.75, 1])
    for (const cy of [0, 0.5, 1]) {
      const orbit = orbitCameraPose({
        timeMs: 5000,
        weight: 1,
        intensity: 1,
        scale: 1.25,
        settings,
        pointAt: () => ({ cx, cy }),
      });
      const fit = orbitCameraCoverScale(aspect, orbit);
      const project = (x: number, y: number) =>
        projectPerspectivePoint(
          { x: bounds.width / 2 + x * 1.25, y: bounds.height / 2 + y * 1.25 },
          bounds,
          { tiltX: 0, tiltY: 0, orbit },
          fit,
        );
      const p = project(0, 0),
        px = project(12, 0),
        py = project(0, 12);
      const a = (px.x - p.x) / 12,
        b = (px.y - p.y) / 12,
        c = (py.x - p.x) / 12,
        d = (py.y - p.y) / 12;
      const trace = a * a + b * b + c * c + d * d,
        determinant = a * d - b * c;
      const smallestScale = Math.sqrt(
        (trace - Math.sqrt(Math.max(0, trace * trace - 4 * determinant * determinant))) / 2,
      );
      // A 12px glyph near the subject must retain at least 10px in its narrowest direction.
      // The former Dynamic preset reduced it to 7px at the same authored zoom.
      expect(smallestScale).toBeGreaterThan(0.85);
    }
});

it.each(ORBIT_PRESETS)('does not secretly enlarge a 1.25x zoom with the $id camera', (preset) => {
  for (const aspect of [9 / 16, 1, 4 / 3, 16 / 9, 21 / 9, 32 / 9])
    for (const automatic of [false, true])
      for (const cx of [0, 0.5, 1]) {
        const pose = orbitCameraPose({
          timeMs: 6000,
          weight: 1,
          intensity: 1,
          scale: 1.25,
          settings: preset.settings,
          ...(!automatic ? { fixed: { cx, cy: 1 - cx } } : {}),
          pointAt: () => ({ cx, cy: 1 - cx }),
        });
        const transform = { tiltX: 0, tiltY: 0, orbit: pose };
        const frame = createPerspectiveGeometry(1080 * aspect, 1080, transform);
        expect(frame.coverScale).toBeLessThanOrEqual(1);
        expect(frame.coverScale).toBeGreaterThan(0);
      }
});
it('preserves the declared zoom exactly for a front-facing camera', () => {
  for (const zoom of [1, 1.25, 1.5, 1.8, 2.2, 3.5, 5]) {
    const pose = orbitCameraPose({
      timeMs: 0,
      weight: 1,
      intensity: 1,
      scale: zoom,
      settings: { ...DEFAULT_ORBIT_SETTINGS, yaw: 0, pitch: 0, roll: 0, horizontal: 0, vertical: 0 },
      pointAt: () => null,
    });
    expect(orbitCameraCoverScale(16 / 9, pose)).toBe(1);
  }
});

it.each(ORBIT_PRESETS)(
  'returns continuously to flat framing with $id instead of a final safety-margin jump',
  (preset) => {
    const fit = (strength: number) =>
      orbitCameraCoverScale(
        16 / 9,
        orbitCameraPose({
          timeMs: 0,
          weight: strength,
          intensity: 1,
          scale: 1,
          settings: preset.settings,
          pointAt: () => ({ cx: 0.9, cy: 0.1 }),
        }),
      );
    expect(fit(0)).toBe(1);
    expect(Math.abs(fit(1e-7) - fit(0))).toBeLessThan(1e-6);
    expect(Math.abs(fit(2e-7) - fit(1e-7))).toBeLessThan(1e-6);
  },
);
it('keeps the complete orbit envelope visible at 1x and holds its size while the cursor moves', () => {
  const bounds = { x: 0, y: 0, width: 1920, height: 1080 };
  for (const preset of ORBIT_PRESETS) {
    let first: number | undefined;
    for (const cx of [0, 0.25, 0.5, 0.75, 1])
      for (const cy of [0, 0.25, 0.5, 0.75, 1]) {
        const pose = orbitCameraPose({
          timeMs: 5000,
          weight: 1,
          intensity: 1,
          scale: 1,
          settings: preset.settings,
          pointAt: () => ({ cx, cy }),
        });
        const fit = orbitCameraCoverScale(16 / 9, pose);
        first ??= fit;
        expect(fit).toBe(first);
        const transform = { tiltX: 0, tiltY: 0, orbit: pose };
        for (const x of [0, 1])
          for (const y of [0, 1]) {
            const point = { x: x * bounds.width, y: y * bounds.height };
            const projected = projectPerspectivePoint(point, bounds, transform, fit);
            expect(projected.x).toBeGreaterThanOrEqual(-1e-6);
            expect(projected.x).toBeLessThanOrEqual(bounds.width + 1e-6);
            expect(projected.y).toBeGreaterThanOrEqual(-1e-6);
            expect(projected.y).toBeLessThanOrEqual(bounds.height + 1e-6);
            const back = unprojectPerspectivePoint(projected, bounds, transform, fit);
            expect(back.x).toBeCloseTo(point.x, 6);
            expect(back.y).toBeCloseTo(point.y, 6);
          }
      }
  }
});
it('removes containment progressively by 2x without a framing discontinuity', () => {
  const settings = ORBIT_PRESETS.find((p) => p.id === 'isometric')!.settings;
  const at = (scale: number) =>
    orbitCameraCoverScale(
      16 / 9,
      orbitCameraPose({
        timeMs: 0,
        weight: 1,
        intensity: 1,
        scale,
        settings,
        fixed: { cx: 0.5, cy: 0.5 },
        pointAt: () => null,
      }),
    );
  const wide = at(1);
  expect(wide).toBeLessThan(1);
  expect(at(1.25)).toBeCloseTo(wide + (1 - wide) * 0.25, 12);
  expect(at(1.5)).toBeCloseTo(wide + (1 - wide) * 0.5, 12);
  expect(at(1.999999)).toBeCloseTo(at(2), 6);
  expect(at(2)).toBe(1);
  expect(at(5)).toBe(1);
});
