import { describe, expect, it } from 'vitest';
import type { DrawingPoint } from '~/media/shared/element-types';
import type { ElementCamera, ElementViewport } from '../element-editor-types';
import { elementMatrix, projectElementPoint, unprojectElementPoint } from '../element-projection';

const cssMatrix = (value: string) => {
  const match = /^matrix3d\((.*)\)$/.exec(value);
  if (!match) throw new Error(`Expected a CSS matrix3d transform, received ${value}`);
  return match[1]!.split(',').map(Number);
};

const transformPoint = (matrix: number[], point: DrawingPoint): DrawingPoint => {
  const w = matrix[3]! * point.x + matrix[7]! * point.y + matrix[15]!;
  return {
    x: (matrix[0]! * point.x + matrix[4]! * point.y + matrix[12]!) / w,
    y: (matrix[1]! * point.x + matrix[5]! * point.y + matrix[13]!) / w,
  };
};

const rectCorners = (width: number, height: number): DrawingPoint[] => [
  { x: 0, y: 0 },
  { x: width, y: 0 },
  { x: width, y: height },
  { x: 0, y: height },
];

const rotateInRect = (point: DrawingPoint, rect: ElementViewport, rotation: number): DrawingPoint => {
  const radians = (rotation * Math.PI) / 180;
  const cos = Math.cos(radians);
  const sin = Math.sin(radians);
  const x = point.x - rect.width / 2;
  const y = point.y - rect.height / 2;
  return {
    x: rect.x + rect.width / 2 + x * cos - y * sin,
    y: rect.y + rect.height / 2 + x * sin + y * cos,
  };
};

const expectPoint = (actual: DrawingPoint, expected: DrawingPoint) => {
  expect(actual.x).toBeCloseTo(expected.x, 6);
  expect(actual.y).toBeCloseTo(expected.y, 6);
};

describe('element projection', () => {
  it('maps an identity element matrix to its original viewport rectangle', () => {
    const viewport = { x: 0, y: 0, width: 800, height: 450 };
    const rect = { x: 120, y: 70, width: 280, height: 120 };
    const matrix = cssMatrix(elementMatrix(rect, viewport));
    const corners = rectCorners(rect.width, rect.height).map((point) => transformPoint(matrix, point));

    const expected = [
      { x: 120, y: 70 },
      { x: 400, y: 70 },
      { x: 400, y: 190 },
      { x: 120, y: 190 },
    ];
    corners.forEach((point, index) => expectPoint(point, expected[index]!));
  });

  it('rotates the element around its center while preserving the translated viewport position', () => {
    const viewport = { x: 20, y: 10, width: 800, height: 450 };
    const rect = { x: 120, y: 90, width: 240, height: 100 };
    const rotation = 90;
    const matrix = cssMatrix(elementMatrix(rect, viewport, {}, rotation));
    const actual = rectCorners(rect.width, rect.height).map((point) => transformPoint(matrix, point));
    const expected = rectCorners(rect.width, rect.height).map((point) =>
      projectElementPoint(rotateInRect(point, rect, rotation), viewport),
    );

    actual.forEach((point, index) => expectPoint(point, expected[index]!));
    expectPoint(actual[0]!, { x: 290, y: 20 });
  });

  it('encodes camera zoom and focus as an affine matrix when there is no tilt', () => {
    const viewport = { x: 35, y: 25, width: 1_000, height: 600 };
    const rect = { x: 350, y: 180, width: 200, height: 100 };
    const camera: ElementCamera = { scale: 1.75, focusX: 420, focusY: 210 };
    const matrix = cssMatrix(elementMatrix(rect, viewport, camera));
    const expected = projectElementPoint({ x: rect.x, y: rect.y }, viewport, camera);
    const topLeft = transformPoint(matrix, { x: 0, y: 0 });

    expectPoint(topLeft, expected);
    expect(matrix[0]).toBeCloseTo(1.75, 6);
    expect(matrix[5]).toBeCloseTo(1.75, 6);
    expect(matrix[3]).toBeCloseTo(0, 6);
    expect(matrix[7]).toBeCloseTo(0, 6);
  });

  it('round-trips normalized points through zoom, focus, and perspective tilt', () => {
    const viewport = { x: 40, y: 30, width: 960, height: 540 };
    const camera: ElementCamera = {
      scale: 1.4,
      focusX: 460,
      focusY: 260,
      tiltX: 0.24,
      tiltY: -0.19,
    };
    const source = { x: 0.31, y: 0.67 };
    const projected = projectElementPoint(
      { x: viewport.x + source.x * viewport.width, y: viewport.y + source.y * viewport.height },
      viewport,
      camera,
    );

    expectPoint(unprojectElementPoint(projected, viewport, camera), source);
  });

  it('maps all four rotated corners onto the camera-projected CSS homography', () => {
    const viewport = { x: 15, y: 25, width: 1_000, height: 560 };
    const rect = { x: 240, y: 120, width: 310, height: 170 };
    const camera: ElementCamera = {
      scale: 1.25,
      focusX: 520,
      focusY: 270,
      tiltX: 0.3,
      tiltY: -0.22,
    };
    const rotation = 17;
    const matrix = cssMatrix(elementMatrix(rect, viewport, camera, rotation));
    const actual = rectCorners(rect.width, rect.height).map((point) => transformPoint(matrix, point));
    const expected = rectCorners(rect.width, rect.height).map((point) =>
      projectElementPoint(rotateInRect(point, rect, rotation), viewport, camera),
    );

    actual.forEach((point, index) => expectPoint(point, expected[index]!));
  });
});
