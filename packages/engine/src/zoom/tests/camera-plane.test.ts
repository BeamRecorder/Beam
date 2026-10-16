import { expect, it } from 'vitest';
import { cameraPlaneGeometry } from '../camera-plane';
import { orbitCameraPose } from '../orbit-camera';
import { ORBIT_PRESETS } from '../orbit-settings';
import { projectPerspectivePoint } from '../perspective-projection';

it('retains the complete scene and halo instead of using the visible zoom window as texture edges', () => {
  const frame = cameraPlaneGeometry(
    400,
    240,
    { tiltX: 0, tiltY: 0 },
    { scale: 1.25, focusX: 0.5, focusY: 0.5 },
    { x: -100, y: -60, width: 600, height: 360 },
  );
  expect([...frame.positions]).toEqual([
    -1.875, 1.875, 0, 1, -1.875, -1.875, 0, 1, 1.875, 1.875, 0, 1, 1.875, -1.875, 0, 1,
  ]);
});
it('uses the same projective plane for media, borders, shadows and editor point mapping', () => {
  const bounds = { x: 0, y: 0, width: 400, height: 240 },
    source = { x: -100, y: -100, width: 600, height: 440 };
  for (const preset of ORBIT_PRESETS)
    for (const scale of [1.25, 1.8, 5])
      for (const focusX of [0, 0.5, 1]) {
        const camera = { scale, focusX, focusY: 1 - focusX };
        const orbit = orbitCameraPose({
          timeMs: 0,
          weight: 1,
          intensity: 1,
          scale,
          settings: preset.settings,
          fixed: { cx: focusX, cy: camera.focusY },
          pointAt: () => null,
        });
        const transform = { tiltX: 0, tiltY: 0, orbit };
        const frame = cameraPlaneGeometry(400, 240, transform, camera, source);
        const positions = frame.positions;
        expect([...positions].every(Number.isFinite)).toBe(true);
        for (const point of [
          { x: 0, y: 120 },
          { x: 200, y: 0 },
          { x: 400, y: 240 },
          { x: 200, y: 120 },
          { x: -40, y: 100 },
        ]) {
          const u = (point.x - source.x) / source.width,
            v = (point.y - source.y) / source.height;
          const vertex = (axis: number) =>
            positions[axis]! +
            (positions[8 + axis]! - positions[axis]!) * u +
            (positions[4 + axis]! - positions[axis]!) * v;
          if (vertex(3) <= 0.01) continue; // Points behind the eye are clipped by WebGL.
          const rendered = { x: (vertex(0) / vertex(3) + 1) * 200, y: (1 - vertex(1) / vertex(3)) * 120 };
          const expected = projectPerspectivePoint(
            { x: 200 + (point.x - focusX * 400) * scale, y: 120 + (point.y - camera.focusY * 240) * scale },
            bounds,
            transform,
            frame.coverScale,
          );
          expect(rendered.x).toBeCloseTo(expected.x, 2);
          expect(rendered.y).toBeCloseTo(expected.y, 2);
        }
      }
});
it('maps off-center manual focus without moving or rescaling the source texture bounds', () => {
  const source = { x: 0, y: 0, width: 400, height: 240 },
    transform = { tiltX: 0, tiltY: 0 };
  const left = cameraPlaneGeometry(400, 240, transform, { scale: 2, focusX: 0.25, focusY: 0.5 }, source);
  const right = cameraPlaneGeometry(400, 240, transform, { scale: 2, focusX: 0.75, focusY: 0.5 }, source);
  for (const offset of [0, 4, 8, 12]) expect(left.positions[offset]! - right.positions[offset]!).toBe(2);
  expect(left.positions[8]! - left.positions[0]!).toBe(4);
});
