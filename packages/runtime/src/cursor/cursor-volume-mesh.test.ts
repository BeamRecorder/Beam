import { expect, it } from 'vitest';
import { cursorFaceMesh, cursorVolumeMesh } from './cursor-volume-mesh';
const mask = (w: number, h: number, predicate: (x: number, y: number) => boolean) => {
  const rgba = new Uint8ClampedArray(w * h * 4);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) rgba[(y * w + x) * 4 + 3] = predicate(x, y) ? 255 : 0;
  return rgba;
};
it('uses the identical front cap for flat and extruded artwork, including holes', () => {
  for (const predicate of [() => false, () => true, (x: number, y: number) => x !== y])
    expect(cursorVolumeMesh(mask(3, 3, predicate), 3, 3).slice(0, 48)).toEqual(cursorFaceMesh());
});
it('maps the complete flat artwork to outward-facing unit triangles', () => {
  const face = cursorFaceMesh();
  expect(face.length).toBe(48);
  for (let index = 0; index < face.length; index += 8) {
    expect(Array.from(face.slice(index + 2, index + 8))).toEqual([0, face[index], face[index + 1], 0, 0, 1]);
  }
});
it('owns each front-cap array independently', () => {
  const face = cursorFaceMesh();
  face.fill(NaN);
  expect(Array.from(cursorFaceMesh()).every(Number.isFinite)).toBe(true);
});
it('retains the front and back artwork caps for a transparent silhouette', () => {
  const mesh = cursorVolumeMesh(
    mask(2, 2, () => false),
    2,
    2,
  );
  expect(mesh.length).toBe(12 * 8);
  expect(mesh[2]).toBe(0);
  expect(mesh[6 * 8 + 2]).toBeCloseTo(-0.18);
});
it('extrudes only boundary edges rather than internal pixel edges', () => {
  expect(
    cursorVolumeMesh(
      mask(1, 1, () => true),
      1,
      1,
    ).length,
  ).toBe(36 * 8);
  expect(
    cursorVolumeMesh(
      mask(2, 2, () => true),
      2,
      2,
    ).length,
  ).toBe((12 + 8 * 6) * 8);
});
it('keeps holes and disconnected components with outward unit normals', () => {
  const mesh = cursorVolumeMesh(
    mask(3, 3, (x, y) => x !== 1 || y !== 1),
    3,
    3,
  );
  expect(mesh.length).toBe((12 + 16 * 6) * 8);
  for (let i = 0; i < mesh.length; i += 8) {
    expect(Math.hypot(mesh[i + 5]!, mesh[i + 6]!, mesh[i + 7]!)).toBe(1);
    expect(mesh[i + 3]).toBeGreaterThanOrEqual(0);
    expect(mesh[i + 4]).toBeLessThanOrEqual(1);
  }
});
it('bounds a worst-case checkerboard at the maximum silhouette size', () => {
  const mesh = cursorVolumeMesh(
    mask(128, 128, (x, y) => (x + y) % 2 === 0),
    128,
    128,
  );
  expect(mesh.byteLength).toBeLessThan(7 * 1024 * 1024);
  expect(Array.from(mesh).every(Number.isFinite)).toBe(true);
});
it.each([
  [0, 1],
  [129, 1],
  [1, 0.5],
  [NaN, 2],
])('rejects invalid dimensions %s x %s', (w, h) => {
  expect(() => cursorVolumeMesh(new Uint8ClampedArray(), w, h)).toThrow(RangeError);
});
it('rejects truncated artwork', () => {
  expect(() => cursorVolumeMesh(new Uint8ClampedArray(3), 1, 1)).toThrow(RangeError);
});
