import type { VectorPoint } from '@beam/engine/shared/shape-vector-types';

/** Use the exact layer homography, including camera zoom, 2D rotation and perspective. */
export function parseElementMatrix(matrix: string): number[] {
  const values = matrix.slice('matrix3d('.length, -1).split(',').map(Number);
  if (!matrix.startsWith('matrix3d(') || values.length !== 16 || values.some((n) => !Number.isFinite(n)))
    throw new TypeError('Invalid element projection.');
  return values;
}
export function projectVectorPoint(point: VectorPoint, matrix: readonly number[]): VectorPoint {
  const w = matrix[3]! * point.x + matrix[7]! * point.y + matrix[15]!;
  return {
    x: (matrix[0]! * point.x + matrix[4]! * point.y + matrix[12]!) / w,
    y: (matrix[1]! * point.x + matrix[5]! * point.y + matrix[13]!) / w,
  };
}
export function unprojectVectorPoint(point: VectorPoint, matrix: readonly number[]): VectorPoint | null {
  const a = matrix[0]! - point.x * matrix[3]!,
    b = matrix[4]! - point.x * matrix[7]!;
  const c = matrix[1]! - point.y * matrix[3]!,
    d = matrix[5]! - point.y * matrix[7]!;
  const x = point.x * matrix[15]! - matrix[12]!,
    y = point.y * matrix[15]! - matrix[13]!;
  const determinant = a * d - b * c;
  if (Math.abs(determinant) < 1e-8) return null;
  return { x: (x * d - b * y) / determinant, y: (a * y - x * c) / determinant };
}
