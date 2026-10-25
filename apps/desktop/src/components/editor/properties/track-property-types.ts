import type { ComputedRef, ShallowRef, WritableComputedRef } from 'vue';

export interface TrackPropertyFeedback {
  revision: number;
  clips: readonly { id: string; delayMs: number }[];
}
export interface TrackPropertyScope {
  available: ComputedRef<boolean>;
  disabled: ComputedRef<boolean>;
  enabled: WritableComputedRef<boolean>;
  feedback: ShallowRef<TrackPropertyFeedback | null>;
}
