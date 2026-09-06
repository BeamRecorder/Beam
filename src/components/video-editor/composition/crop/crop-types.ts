import type { Ref } from 'vue';
import type { ClipComposition } from '~/media/shared/composition-types';

export interface CropDimensions {
  width: number;
  height: number;
}
export type CropEdge = 'top' | 'right' | 'bottom' | 'left';
export interface CropPixels extends CropDimensions {
  top: number;
  right: number;
  bottom: number;
  left: number;
}
export interface CropPreviewOptions {
  composition: Ref<ClipComposition>;
  selectedClipIds: Ref<string[]>;
}
