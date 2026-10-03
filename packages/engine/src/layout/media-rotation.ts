import type { NormalizedTransform } from '../shared/composition-types';
import type { MediaPoint, MediaDimensions } from './media-rotation-types';

/** Keep repeated turns bounded while retaining existing fractional angles. */
export function normalizeMediaRotation(degrees: number): number {
  if (!Number.isFinite(degrees)) throw new TypeError('Media rotation must be finite.');
  return ((degrees % 360) + 360) % 360;
}

export function rotateMediaVector(point: MediaPoint, degrees: number): MediaPoint {
  const radians = (degrees * Math.PI) / 180;
  return {
    x: point.x * Math.cos(radians) - point.y * Math.sin(radians),
    y: point.x * Math.sin(radians) + point.y * Math.cos(radians),
  };
}

/** Preserve the opposite rendered handle when resizing in the media's local axes. */
export function keepMediaResizeAnchor(
  transform: NormalizedTransform,
  initialCenter: MediaPoint,
  resizedCenter: MediaPoint,
  degrees: number,
  viewport: MediaDimensions,
): NormalizedTransform {
  if (degrees % 360 === 0) return transform;
  const delta = { x: resizedCenter.x - initialCenter.x, y: resizedCenter.y - initialCenter.y };
  const rotated = rotateMediaVector(delta, degrees);
  return {
    ...transform,
    x: transform.x + (rotated.x - delta.x) / viewport.width,
    y: transform.y + (rotated.y - delta.y) / viewport.height,
  };
}
