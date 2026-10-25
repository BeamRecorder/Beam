import { computed } from 'vue';
import type { TrackPropertyScope } from '../properties/track-property-types';

/** Bind the existing checkbox models to discrete history edits without reapplying on restoration. */
export function bindTrackPropertyHistory(
  scopes: readonly TrackPropertyScope[],
  commit: () => void,
  available: () => boolean,
) {
  for (const scope of scopes) {
    const mode = scope.enabled;
    scope.enabled = computed({
      get: () => mode.value,
      set: (value: boolean) => {
        if (value === mode.value || (value && scope.disabled.value) || !available()) return;
        commit();
        mode.value = value;
        commit();
      },
    });
  }
}
