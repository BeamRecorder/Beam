import type { Clip, ClipComposition, NormalizedCrop } from '~/media/shared/composition-types';
import { assetForClip } from '~/media/shared/timeline-mapping';
import type { CropDimensions, CropEdge, CropPixels } from './crop-types';

export const FULL_CROP: NormalizedCrop = { x: 0, y: 0, width: 1, height: 1 };
export function cropSourceDimensions(composition: ClipComposition, clip: Clip): CropDimensions | null {
  const asset = assetForClip(composition, clip);
  const width = asset?.width;
  const height = asset?.height;
  return width && height && Number.isInteger(width) && Number.isInteger(height) && width > 0 && height > 0
    ? { width, height }
    : null;
}
const bound = (value: number, max: number) => Math.max(0, Math.min(max, Math.round(value)));
export function cropPixels(crop: NormalizedCrop | undefined, size: CropDimensions): CropPixels {
  const value = crop ?? FULL_CROP;
  const left = bound(value.x * size.width, size.width - 1);
  const top = bound(value.y * size.height, size.height - 1);
  const right = bound((1 - value.x - value.width) * size.width, size.width - left - 1);
  const bottom = bound((1 - value.y - value.height) * size.height, size.height - top - 1);
  return { left, top, right, bottom, width: size.width - left - right, height: size.height - top - bottom };
}
export function cropFromPixels(pixels: CropPixels, size: CropDimensions): NormalizedCrop {
  return {
    x: pixels.left / size.width,
    y: pixels.top / size.height,
    width: (size.width - pixels.left - pixels.right) / size.width,
    height: (size.height - pixels.top - pixels.bottom) / size.height,
  };
}
export function changeCropEdge(
  crop: NormalizedCrop | undefined,
  size: CropDimensions,
  edge: CropEdge,
  value: number,
): NormalizedCrop {
  const pixels = cropPixels(crop, size);
  const max =
    edge === 'left'
      ? size.width - pixels.right - 1
      : edge === 'right'
        ? size.width - pixels.left - 1
        : edge === 'top'
          ? size.height - pixels.bottom - 1
          : size.height - pixels.top - 1;
  if (Number.isFinite(value)) pixels[edge] = bound(value, max);
  return cropFromPixels(pixels, size);
}
export function snapCropToPixels(crop: NormalizedCrop, size: CropDimensions): NormalizedCrop {
  return cropFromPixels(cropPixels(crop, size), size);
}

export function cropsEqual(a: NormalizedCrop | undefined, b: NormalizedCrop | undefined): boolean {
  const left = a ?? FULL_CROP;
  const right = b ?? FULL_CROP;
  return (['x', 'y', 'width', 'height'] as const).every((key) => Math.abs(left[key] - right[key]) < 1e-9);
}
