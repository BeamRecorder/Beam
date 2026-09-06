import type { Ref } from 'vue';
import type { Clip, ClipComposition } from '~/media/shared/composition-types';
export interface CompositionClipEditingOptions {
  composition: Ref<ClipComposition>;
  selectedClip: Ref<Clip | null | undefined>;
  selectedClipId: Ref<string | null>;
  currentTimeSec: Ref<number>;
}
