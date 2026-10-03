export interface MediaOrientationProps {
  mirrored?: boolean;
  mirroredY?: boolean;
  rotation?: number;
  showMirroring?: boolean;
}
export interface MediaOrientationEmits {
  'update:mirrored': [value: boolean];
  'update:mirroredY': [value: boolean];
  'update:rotation': [degrees: number];
}
