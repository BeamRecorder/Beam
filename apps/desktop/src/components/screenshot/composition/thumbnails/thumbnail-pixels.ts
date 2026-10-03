import type { PixelBounds } from './thumbnail-types';

/** Tight alpha bounds keep small cursors and thin arrows legible without stretching them. */
export function alphaBounds(data: Uint8ClampedArray, width: number, height: number): PixelBounds | null {
  let left = width,
    top = height,
    right = -1,
    bottom = -1;
  for (let y = 0; y < height; y++)
    for (let x = 0; x < width; x++) {
      if (!data[(y * width + x) * 4 + 3]) continue;
      left = Math.min(left, x);
      top = Math.min(top, y);
      right = Math.max(right, x);
      bottom = Math.max(bottom, y);
    }
  return right < left ? null : { x: left, y: top, width: right - left + 1, height: bottom - top + 1 };
}
export function fitThumbnail(bounds: PixelBounds, size: number, padding = 6): PixelBounds {
  const scale = Math.max(0, size - padding * 2) / Math.max(bounds.width, bounds.height);
  const width = bounds.width * scale,
    height = bounds.height * scale;
  return { x: (size - width) / 2, y: (size - height) / 2, width, height };
}
