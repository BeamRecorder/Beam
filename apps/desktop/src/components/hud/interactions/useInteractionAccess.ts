import { computed, onBeforeUnmount, onMounted, ref } from 'vue';
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
  let autoResumeAttempted = false;

  const reportFailure = (error: unknown) => {
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
  };

  const hydrate = (preferences: PreferenceSettings) => {
    enabled.value = preferences.recordingInteractions.enabled;
    noticeDismissed.value = preferences.recordingInteractions.noticeDismissed;
    if (!enabled.value) autoResumeAttempted = false;
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
      return;
    }
    status.value = await window.capture.inputAccessStatus();
    if (
      platform === 'linux' &&
      enabled.value &&
      noticeDismissed.value &&
      !autoResumeAttempted &&
      ['permission-required', 'installation-required'].includes(status.value.state)
    ) {
      autoResumeAttempted = true;
      await request();
      return;
    }
    // A stopped Linux broker does not revoke the user's saved recording choice.
    if (platform === 'linux') return;
    if (status.value.state !== 'available' && enabled.value) {
      enabled.value = false;
      const failed = status.value.state === 'denied' || Boolean(status.value.error);
      if (failed) noticeDismissed.value = false;
      await capture.updatePreferences({
        recordingInteractions: {
          enabled: false,
          ...(failed ? { noticeDismissed: false } : {}),
        },
      });
    }
  };

  const request = async () => {
    if (!window.capture?.requestInputAccess || requesting.value) return;
    if (platform === 'linux') autoResumeAttempted = true;
    requesting.value = true;
    try {
      status.value = await window.capture.requestInputAccess();
    } catch (error) {
      reportFailure(error);
    } finally {
      requesting.value = false;
    }
    const available = status.value.state === 'available';
    if (!available && platform === 'linux') return;
    enabled.value = available && (platform === 'darwin' ? enabled.value : true);
    if (available) noticeDismissed.value = true;
    else if (status.value.state === 'denied' || status.value.error) noticeDismissed.value = false;
    try {
      await capture.updatePreferences({
        recordingInteractions: {
          enabled: enabled.value,
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
    await capture.updatePreferences({
      recordingInteractions: { enabled: next },
    });
  };

  const recordingEnabled = computed(() => enabled.value && status.value.state === 'available');
  const recordingRequested = computed(() =>
    platform === 'linux' ? enabled.value && noticeDismissed.value : recordingEnabled.value,
  );

  const focused = () => {
    if (!requesting.value) void refresh().catch(reportFailure);
  };
  onMounted(() => {
    if (platform === 'darwin') window.addEventListener('focus', focused);
  });
  onBeforeUnmount(() => {
    if (platform === 'darwin') window.removeEventListener('focus', focused);
  });

  return {
    status,
    enabled,
    noticeDismissed,
    requesting,
    recordingEnabled,
    recordingRequested,
    hydrate,
    refresh,
    request,
    setEnabled,
  };
}
