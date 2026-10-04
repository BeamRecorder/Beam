import { describe, expect, it } from 'vitest';
import { elementMatrix } from '../element-projection';
import { parseElementMatrix, projectVectorPoint, unprojectVectorPoint } from '../vector-projection';
const rect = { x: 40, y: 80, width: 480, height: 220 };
const viewport = { x: 10, y: 20, width: 1000, height: 600 };
describe('vector node projection', () => {
  it.each(['', 'matrix(1,2,3,4,5,6)', 'matrix3d(1,2)', 'matrix3d(NaN,0,0,0,0,1,0,0,0,0,1,0,0,0,0,1)'])(
    'rejects malformed matrices %s',
    (css) => expect(() => parseElementMatrix(css)).toThrow(),
  );
  it('maps unrotated points into the same canvas position as the artwork', () => {
    const matrix = parseElementMatrix(elementMatrix(rect, viewport));
    expect(projectVectorPoint({ x: 100, y: 30 }, matrix).x).toBeCloseTo(140);
    expect(projectVectorPoint({ x: 100, y: 30 }, matrix).y).toBeCloseTo(110);
    expect(unprojectVectorPoint({ x: 140, y: 110 }, matrix)!.x).toBeCloseTo(100);
    expect(unprojectVectorPoint({ x: 140, y: 110 }, matrix)!.y).toBeCloseTo(30);
  });
  it.each([0, 35, 90, 180, 270])('round-trips rotation %s with zoom and 3D perspective', (rotation) => {
    const css = elementMatrix(
      rect,
      viewport,
      { scale: 1.8, focusX: 500, focusY: 280, tiltX: 10, tiltY: -12 },
      rotation,
      { x: 12, y: 24, perspective: 800 },
    );
    const matrix = parseElementMatrix(css);
    for (const point of [
      { x: 0, y: 0 },
      { x: 120, y: 70 },
      { x: 480, y: 220 },
    ]) {
      const restored = unprojectVectorPoint(projectVectorPoint(point, matrix), matrix)!;
      expect(restored.x).toBeCloseTo(point.x, 6);
      expect(restored.y).toBeCloseTo(point.y, 6);
    }
  });
  it('returns no inverse for an edge-on or degenerate plane', () => {
    const matrix = parseElementMatrix('matrix3d(0,0,0,0,0,0,0,0,0,0,1,0,40,80,0,1)');
    expect(unprojectVectorPoint({ x: 40, y: 80 }, matrix)).toBeNull();
  });
});
