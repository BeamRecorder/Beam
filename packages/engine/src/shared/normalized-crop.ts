import type { NormalizedCrop } from './composition-types';
import type { CropDimensions } from './crop-types';

export const clampNormalizedCrop = (value: NormalizedCrop, size?: CropDimensions): NormalizedCrop => {
  const width = Math.min(1, Math.max(size ? 1 / size.width : 0.05, value.width));
  const height = Math.min(1, Math.max(size ? 1 / size.height : 0.05, value.height));
  return {
    x: Math.min(1 - width, Math.max(0, value.x)),
    y: Math.min(1 - height, Math.max(0, value.y)),
    width,
    height,
  };
};
