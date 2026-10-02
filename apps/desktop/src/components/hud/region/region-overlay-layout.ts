import type { ScreenRegion } from '~/api/types/screen-region';
import type { RegionControlPosition, RegionPointer, RegionViewport } from './region-overlay-types';

const fit = (position: number, size: number, available: number, inset = 8) =>
  Math.max(inset, Math.min(position, available - size - inset));

export function regionControlPosition(
  region: ScreenRegion,
  viewport: RegionViewport,
  size: RegionViewport,
  edge: 'top' | 'bottom',
): RegionControlPosition {
  const left = region.x * viewport.width;
  const top = region.y * viewport.height;
  const bottom = (region.y + region.height) * viewport.height;
  const inset = 16;
  const gap = 12;
  const above = top >= size.height + gap + inset;
  const below = bottom + size.height + gap + inset <= viewport.height;
  // Anchor controls above the crop from their bottom edge. Their actual height
  // can change with wrapping or errors without waiting for ResizeObserver.
  const useBottom = edge === 'top' ? above : !below;
  const position = useBottom
    ? viewport.height - (edge === 'top' ? top : bottom) + gap
    : (edge === 'top' ? top : bottom) + gap;
  const vertical = `${fit(position, size.height, viewport.height, inset)}px`;
  return {
    left: `${fit(left, size.width, viewport.width, inset)}px`,
    ...(useBottom ? { bottom: vertical } : { top: vertical }),
  };
}

export function magnifierPosition(pointer: RegionPointer, viewport: RegionViewport, size = 144) {
  const preferLeft = pointer.handle?.includes('w') ?? false;
  const preferTop = pointer.handle?.includes('n') ?? false;
  const gap = 24;
  const x = preferLeft ? pointer.x - size - gap : pointer.x + gap;
  const y = preferTop ? pointer.y - size - gap : pointer.y + gap;
  const oppositeX = preferLeft ? pointer.x + gap : pointer.x - size - gap;
  const oppositeY = preferTop ? pointer.y + gap : pointer.y - size - gap;
  return {
    left: `${fit(x < 8 || x + size > viewport.width - 8 ? oppositeX : x, size, viewport.width)}px`,
    top: `${fit(y < 8 || y + size > viewport.height - 8 ? oppositeY : y, size, viewport.height)}px`,
  };
}
