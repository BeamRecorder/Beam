import type { ComputedRef, InjectionKey, Ref } from 'vue';
import type { ClipComposition } from '@beam/engine/shared/composition-types';
import type { CursorPresentationSettings } from '@beam/engine/capture/cursor-presentation';
import type { TrackPropertyScope } from '../track-property-types';

export interface CursorPropertyScope extends TrackPropertyScope {
  enabledTracks: ComputedRef<readonly string[]>;
  restore: (trackIds: readonly string[]) => void;
  hasTargets: ComputedRef<boolean>;
  settings: ComputedRef<CursorPresentationSettings>;
  update: (settings: CursorPresentationSettings) => void;
  synchronizeVisibility: (next: ClipComposition) => ClipComposition;
  reset: () => void;
}
export interface RecordingCursorPropertyOptions {
  composition: Ref<ClipComposition>;
  selectedId: Ref<string | null>;
  selectedIds: Ref<string[]>;
  time: Ref<number>;
  defaults: Ref<CursorPresentationSettings>;
}
export const cursorPropertyScopeKey: InjectionKey<CursorPropertyScope> = Symbol('cursor-property-scope');
