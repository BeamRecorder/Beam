import type { ComputedRef, ShallowRef, WritableComputedRef } from 'vue';
import type { ClipComposition } from '@beam/engine/shared/composition-types';

export interface ClipTrackPropertyFeedback {
  revision: number;
  clips: readonly { id: string; delayMs: number }[];
}

export interface ClipTrackPropertyScope {
  available: ComputedRef<boolean>;
  disabled: ComputedRef<boolean>;
  enabled: WritableComputedRef<boolean>;
  enabledTracks: ComputedRef<readonly string[]>;
  restore: (trackIds: readonly string[]) => void;
  feedback: ShallowRef<ClipTrackPropertyFeedback | null>;
  synchronize: (composition: ClipComposition) => ClipComposition;
  reset: () => void;
}
