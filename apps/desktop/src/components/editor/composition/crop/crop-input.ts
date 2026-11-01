import type { CropPixels } from '@beam/engine/shared/crop-types';
import { changeCropDimension, changeCropEdge, cropFromPixels } from '@beam/engine/layout/crop/crop-pixels';
import type { CropField, CropUnit } from './crop-types';

export function cropInputSize(pixels: CropPixels) {
  return { width: pixels.left + pixels.width + pixels.right, height: pixels.top + pixels.height + pixels.bottom };
}

export function cropInputValue(pixels: CropPixels, field: CropField, unit: CropUnit) {
  const size = cropInputSize(pixels),
    axis = field === 'left' || field === 'right' || field === 'width' ? 'width' : 'height';
  return unit === 'px' ? pixels[field] : Number(((pixels[field] * 100) / size[axis]).toFixed(2));
}

export function changeCropInput(pixels: CropPixels, field: CropField, raw: string | number, unit: CropUnit) {
  if (typeof raw === 'string' && !raw.trim()) return null;
  const value = Number(raw);
  if (!Number.isFinite(value) || value === cropInputValue(pixels, field, unit)) return null;
  const size = cropInputSize(pixels),
    crop = cropFromPixels(pixels, size),
    axis = field === 'left' || field === 'right' || field === 'width' ? 'width' : 'height',
    valueInPixels = unit === 'px' ? value : (value * size[axis]) / 100;
  return field === 'width' || field === 'height'
    ? changeCropDimension(crop, size, field, valueInPixels)
    : changeCropEdge(crop, size, field, valueInPixels);
}
