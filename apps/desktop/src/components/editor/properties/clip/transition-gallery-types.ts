import type { Ref } from 'vue';

export interface TransitionGalleryMemory {
  category: Ref<string | null>;
  pending: number;
  saving: Promise<void>;
}
