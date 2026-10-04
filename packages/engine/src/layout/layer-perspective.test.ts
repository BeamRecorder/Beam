import { describe, expect, it } from 'vitest';
import {
  layerPerspectiveDistance,
  hasLayerRotation3d,
  layerPerspectiveGeometry,
  layerPerspectiveCorners,
  projectLayerPoint,
  pointInsideLayerQuad,
} from './layer-perspective';
import { validateLayerRotation3d } from './layer-perspective-schema.js';
const rect = { x: 100, y: 100, width: 400, height: 200 };
const zero = { x: 0, y: 0, perspective: 1200 };
describe('local layer perspective', () => {
  it.each([undefined, zero, { ...zero, x: 24 }, { ...zero, y: -24 }])(
    'identifies whether %j needs GPU projection',
    (value) => {
      expect(hasLayerRotation3d(value)).toBe(Boolean(value && (value.x || value.y)));
    },
  );
  it.each([zero, { x: -80, y: 80, perspective: 200 }, { x: 80, y: -80, perspective: 10000 }])(
    'validates boundary settings %j',
    (value) => expect(() => validateLayerRotation3d(value)).not.toThrow(),
  );
  it.each([
    null,
    [],
    {},
    { ...zero, x: NaN },
    { ...zero, y: 81 },
    { ...zero, perspective: 199 },
    { ...zero, perspective: Infinity },
    { ...zero, extra: 1 },
  ])('rejects malformed settings %j', (value) => expect(() => validateLayerRotation3d(value)).toThrow('3D rotation'));
  it('keeps flat positions and the local center unchanged', () => {
    expect(projectLayerPoint({ x: 123, y: 147 }, rect, zero)).toEqual({ x: 123, y: 147 });
    expect(projectLayerPoint({ x: 300, y: 200 }, rect, { ...zero, x: 30, y: -40 })).toEqual({ x: 300, y: 200 });
    expect([...layerPerspectiveGeometry(800, 600, rect, zero)]).toEqual([
      -1, 1, 0, 1, -1, -1, 0, 1, 1, 1, 0, 1, 1, -1, 0, 1,
    ]);
  });
  it.each([30, -30, 75])('projects pitch %s like CSS while retaining correct perspective interpolation', (x) => {
    const rotation = { ...zero, x },
      p = projectLayerPoint({ x: 100, y: 100 }, rect, rotation);
    const radians = (x * Math.PI) / 180,
      w = 1 + (100 * Math.sin(radians)) / 1200;
    expect(p.x).toBeCloseTo(300 - 200 / w);
    expect(p.y).toBeCloseTo(200 - (100 * Math.cos(radians)) / w);
    const geometry = layerPerspectiveGeometry(800, 600, rect, rotation);
    expect(geometry).toHaveLength(16);
    expect([...geometry].every(Number.isFinite)).toBe(true);
  });
  it.each([0, 90, 180])('projects 2D rotation %s before local 3D tilt', (angle) => {
    const flat = layerPerspectiveCorners(rect, undefined, angle),
      tilt = { ...zero, y: 25 };
    const tilted = layerPerspectiveCorners(rect, tilt, angle);
    expect(tilted).toEqual(flat.map((p) => projectLayerPoint(p, rect, tilt)));
    expect(pointInsideLayerQuad({ x: 300, y: 200 }, tilted)).toBe(true);
    expect(pointInsideLayerQuad({ x: 900, y: 900 }, tilted)).toBe(false);
    expect(pointInsideLayerQuad(tilted[0]!, tilted)).toBe(true);
    expect(pointInsideLayerQuad({ x: 300, y: 200 }, [...tilted].reverse())).toBe(true);
  });
});

it.each([0, 90, 180])('keeps wide tilted layers in front of the camera at rotation %s', (angle) => {
  const wide = { x: 0, y: 0, width: 1920, height: 1004 },
    rotation = { x: 80, y: -80, perspective: 200 };
  const corners = layerPerspectiveCorners(wide, rotation, angle);
  expect(corners.every((p) => Number.isFinite(p.x) && Number.isFinite(p.y))).toBe(true);
  expect(pointInsideLayerQuad({ x: 960, y: 502 }, corners)).toBe(true);
  expect(layerPerspectiveDistance(wide, 200)).toBeGreaterThan(1000);
  expect(layerPerspectiveDistance(wide, 1200)).toBe(1200);
  expect(layerPerspectiveDistance({ ...wide, width: 960, height: 502 }, 100)).toBeCloseTo(
    layerPerspectiveDistance(wide, 200) / 2,
  );
});
