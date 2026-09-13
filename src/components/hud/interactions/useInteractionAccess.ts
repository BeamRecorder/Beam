import { computed, ref } from 'vue';
import { capture } from '~/api/capture';
import { useTranslate } from '~/i18n/useTranslate';
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
  const { t } = useTranslate('HUD');
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
      const failed = status.value.state === 'denied' || Boolean(status.value.error);
      if (failed) noticeDismissed.value = false;
      await capture.updatePreferences({
        recordingInteractions: { enabled: false, ...(failed ? { noticeDismissed: false } : {}) },
      });
    }
  };

  const request = async () => {
    if (!window.capture?.requestInputAccess || requesting.value) return;
    requesting.value = true;
    try {
      status.value = await window.capture.requestInputAccess();
    } catch (error) {
      status.value = {
        state: 'unavailable',
        canRequest: true,
        clicks: false,
        shortcuts: false,
        recordsText: false,
        error: {
          code: 'input-access-failed',
          message: error instanceof Error ? error.message : t('inputAccessFailed'),
        },
      };
      enabled.value = false;
      noticeDismissed.value = false;
      try {
        await capture.updatePreferences({ recordingInteractions: { enabled: false, noticeDismissed: false } });
      } catch {
        // Preserve the access failure even if preference persistence also fails.
      }
      return;
    } finally {
      requesting.value = false;
    }
    const available = status.value.state === 'available';
    enabled.value = available;
    if (available) noticeDismissed.value = true;
    else if (status.value.state === 'denied' || status.value.error) noticeDismissed.value = false;
    try {
      await capture.updatePreferences({
        recordingInteractions: {
          enabled: available,
          ...(available || status.value.state === 'denied' || status.value.error
            ? { noticeDismissed: noticeDismissed.value }
            : {}),
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
