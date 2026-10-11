import { computed, onBeforeUnmount, onMounted, ref, shallowRef } from 'vue';
import { capture } from '~/api/capture';
import type { AppUpdateState } from '~/api/types/capture-api';
import type { UpdateAction } from './update-types';

export function useAppUpdates() {
  const state = shallowRef<AppUpdateState | null>(null);
  const pending = ref(false);
  const error = ref('');
  const attention = computed(
    () =>
      ['available', 'downloading', 'downloaded'].includes(state.value?.status ?? '') ||
      (state.value?.status === 'error' && Boolean(state.value.availableVersion)),
  );
  let revision = 0;
  let disposed = false;
  let unsubscribe: (() => void) | undefined;
  const receive = (next: AppUpdateState) => {
    if (disposed) return;
    revision++;
    state.value = next;
    error.value = '';
  };
  onMounted(async () => {
    const initialRevision = revision;
    try {
      unsubscribe = capture.onUpdateState(receive);
      const initial = await capture.getUpdateState();
      if (!disposed && revision === initialRevision) receive(initial);
    } catch (reason) {
      if (!disposed && revision === initialRevision)
        error.value = reason instanceof Error ? reason.message : String(reason);
    }
  });
  onBeforeUnmount(() => {
    disposed = true;
    unsubscribe?.();
  });
  const perform = async (action: UpdateAction) => {
    const status = state.value?.status;
    if (pending.value || !status || status === 'unsupported') return;
    if (action === 'download' && status !== 'available' && !(status === 'error' && state.value?.availableVersion))
      return;
    if (action === 'restart' && status !== 'downloaded') return;
    if (action === 'check' && ['checking', 'downloading', 'downloaded'].includes(status)) return;
    pending.value = true;
    error.value = '';
    try {
      if (action === 'check') {
        const initialRevision = revision;
        const next = await capture.checkForUpdates();
        if (revision === initialRevision) receive(next);
      } else if (action === 'download') await capture.downloadUpdate();
      else await capture.quitAndInstallUpdate();
    } catch (reason) {
      if (!disposed) error.value = reason instanceof Error ? reason.message : String(reason);
    } finally {
      if (!disposed) pending.value = false;
    }
  };
  return { state, pending, error, attention, perform };
}
