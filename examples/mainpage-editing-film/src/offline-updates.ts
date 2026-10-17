import { ref, shallowRef } from 'vue';
import type { AppUpdateState } from '../../../apps/desktop/src/api/types/capture-api';
/** There is no application updater in a standalone composition host. */
export function useAppUpdates() {
  return { state: shallowRef<AppUpdateState | null>(null), attention: ref(false) };
}
