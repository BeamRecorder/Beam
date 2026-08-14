import { computed, ref } from 'vue';
import { capture } from '~/api/capture';
import type { PreferenceSettings } from '~/api/types/capture-api';
import type { InteractionAccessViewState } from './interaction-access-types';

const checkingState = (): InteractionAccessViewState => ({
  state: 'checking',
  canRequest: false,
  clicks: false,
  shortcuts: false,
  recordsText: false,
});

export function useInteractionAccess() {
  const status = ref<InteractionAccessViewState>(checkingState());
  const enabled = ref(false);
  const requesting = ref(false);

  const hydrate = (preferences: PreferenceSettings) => {
    enabled.value = preferences.recordingInteractions.enabled;
  };

  const refresh = async () => {
    if (!window.capture?.inputAccessStatus) {
      status.value = {
        state: 'unavailable',
        canRequest: false,
        clicks: false,
        shortcuts: false,
        recordsText: false,
      };
      enabled.value = false;
      return;
    }
    status.value = await window.capture.inputAccessStatus();
    if (status.value.state !== 'available' && enabled.value) {
      enabled.value = false;
      await capture.updatePreferences({ recordingInteractions: { enabled: false } });
    }
  };

  const request = async () => {
    if (!window.capture?.requestInputAccess || requesting.value) return;
    requesting.value = true;
    try {
      status.value = await window.capture.requestInputAccess();
      if (status.value.state === 'available') {
        enabled.value = true;
        await capture.updatePreferences({ recordingInteractions: { enabled: true } });
      }
    } catch {
      status.value = {
        state: 'denied',
        canRequest: true,
        clicks: false,
        shortcuts: false,
        recordsText: false,
      };
    } finally {
      requesting.value = false;
    }
  };

  const setEnabled = async (value: boolean) => {
    const next = status.value.state === 'available' && value;
    enabled.value = next;
    await capture.updatePreferences({ recordingInteractions: { enabled: next } });
  };

  const recordingEnabled = computed(() => enabled.value && status.value.state === 'available');

  return {
    status,
    enabled,
    requesting,
    recordingEnabled,
    hydrate,
    refresh,
    request,
    setEnabled,
  };
}
