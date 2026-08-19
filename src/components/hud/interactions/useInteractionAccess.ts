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

export function useInteractionAccess(platform: string = window.capture?.platform ?? 'unknown') {
  const status = ref<InteractionAccessViewState>(checkingState());
  const enabled = ref(false);
  const noticeDismissed = ref(false);
  const requesting = ref(false);

  const hydrate = (preferences: PreferenceSettings) => {
    enabled.value = preferences.recordingInteractions.enabled;
    noticeDismissed.value = preferences.recordingInteractions.noticeDismissed;
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
    if (
      platform === 'linux' &&
      enabled.value &&
      noticeDismissed.value &&
      status.value.state === 'permission-required'
    ) {
      await request();
      return;
    }
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
    } catch {
      status.value = {
        state: 'denied',
        canRequest: true,
        clicks: false,
        shortcuts: false,
        recordsText: false,
      };
      enabled.value = false;
      noticeDismissed.value = false;
      try {
        await capture.updatePreferences({ recordingInteractions: { enabled: false, noticeDismissed: false } });
      } catch {
        // The native denial remains authoritative even if preference persistence fails.
      }
      return;
    } finally {
      requesting.value = false;
    }
    const available = status.value.state === 'available';
    enabled.value = available;
    if (available) noticeDismissed.value = true;
    try {
      await capture.updatePreferences({
        recordingInteractions: {
          enabled: available,
          ...(available ? { noticeDismissed: true } : {}),
        },
      });
    } catch {
      // Keep the native status for this session; persistence can be retried later.
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
    noticeDismissed,
    requesting,
    recordingEnabled,
    hydrate,
    refresh,
    request,
    setEnabled,
  };
}
