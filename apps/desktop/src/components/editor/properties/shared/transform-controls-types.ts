import type { NormalizedTransform } from '@beam/engine/shared/composition-types';
import type { MediaDimensions } from '@beam/engine/layout/media-rotation-types';
export interface TransformControlsProps {
  modelValue: NormalizedTransform;
  canvasSize: MediaDimensions;
  mirrored?: boolean;
  mirroredY?: boolean;
  rotation?: number;
  showMirroring?: boolean;
}
export interface TransformControlsEmits {
  'update:modelValue': [value: NormalizedTransform];
  'update:mirrored': [value: boolean];
  'update:mirroredY': [value: boolean];
  'update:rotation': [degrees: number];
}
