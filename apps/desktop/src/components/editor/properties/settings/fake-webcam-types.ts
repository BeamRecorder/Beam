import type { Ref } from 'vue';
import type { ClipAppearance, ClipComposition } from '@beam/engine/shared/composition-types';

export interface FakeWebcamOverlayOptions {
  composition: Ref<ClipComposition>;
  projectId: () => string | null;
  selectedClipId: () => string | null;
  currentTimeMs: () => number;
  appearance: () => ClipAppearance;
  onAdded: () => void;
}
