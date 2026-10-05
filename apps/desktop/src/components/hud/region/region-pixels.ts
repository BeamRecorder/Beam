import type { ScreenRegion } from '~/api/types/screen-region';
import type { RegionPixelRect, RegionViewport } from './region-overlay-types';

export function regionPixelRect(region: ScreenRegion, size: RegionViewport): RegionPixelRect {
  if (![size.width, size.height].every((value) => Number.isInteger(value) && value > 0))
    throw new RangeError('Region pixel dimensions must be positive integers');
  // Match ScreenRegion::pixel_rect in Rust: round both edges, not the size.
  const left = Math.max(0, Math.min(size.width - 1, Math.round(region.x * size.width)));
  const top = Math.max(0, Math.min(size.height - 1, Math.round(region.y * size.height)));
  const right = Math.max(left + 1, Math.min(size.width, Math.round((region.x + region.width) * size.width)));
  const bottom = Math.max(top + 1, Math.min(size.height, Math.round((region.y + region.height) * size.height)));
  return { left, top, right, bottom };
}

export function alignRegionToPixels(region: ScreenRegion, size: RegionViewport, video: boolean): ScreenRegion {
  // An unfinished, zero-size drawing is restored by the gesture handler.
  if (region.width <= 0 || region.height <= 0) return region;
  const rect = regionPixelRect(region, size);
  if (video && (size.width < 2 || size.height < 2))
    throw new RangeError('Video region dimensions must be at least two pixels');
  const width = video ? Math.max(2, Math.floor((rect.right - rect.left) / 2) * 2) : rect.right - rect.left;
  const height = video ? Math.max(2, Math.floor((rect.bottom - rect.top) / 2) * 2) : rect.bottom - rect.top;
  const x = Math.min(rect.left, size.width - width) / size.width;
  const y = Math.min(rect.top, size.height - height) / size.height;
  return { x, y, width: Math.min(1 - x, width / size.width), height: Math.min(1 - y, height / size.height) };
}
