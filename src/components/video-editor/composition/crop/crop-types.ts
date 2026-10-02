import type { Ref } from 'vue';
import type { ClipComposition } from '@beam/engine/shared/composition-types';

export interface CropPreviewOptions {
  composition: Ref<ClipComposition>;
  selectedClipIds: Ref<string[]>;
}
