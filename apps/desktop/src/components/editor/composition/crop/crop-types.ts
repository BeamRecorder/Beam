import type { Ref } from 'vue';
import type { ClipComposition } from '@beam/engine/shared/composition-types';
import type { CropDimensions, CropEdge } from '@beam/engine/shared/crop-types';

export type CropField = CropEdge | keyof CropDimensions;
export type CropUnit = 'px' | '%';

export interface CropPreviewOptions {
  composition: Ref<ClipComposition>;
  selectedClipIds: Ref<string[]>;
}
