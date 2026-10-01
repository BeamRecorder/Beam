import { ref } from 'vue';
import { capture } from '~/api/capture';
import type { PreferenceSettings } from '~/api/types/capture-api';
import type { RegionRecordingSettings } from '~/api/types/screen-region';
import type { HudRegionSettingRefs } from './region-settings-types';
export function useRegionRecordingSettings(state: HudRegionSettingRefs) {
  const hideTaskbar = ref(false);
  const hideDesktopIcons = ref(false);
  const showRealCursor = ref(false);
  const snapshot = (): RegionRecordingSettings => ({
    cameraId: state.cameraId.value,
    microphoneId: state.microphoneId.value,
    systemAudio: state.systemAudioMode.value === 'on',
    countdownSeconds: state.countdownSeconds.value,
    hideTaskbar: hideTaskbar.value,
    hideDesktopIcons: hideDesktopIcons.value,
    showRealCursor: showRealCursor.value,
  });
  const apply = (settings: RegionRecordingSettings) => {
    state.cameraId.value = settings.cameraId;
    state.microphoneId.value = settings.microphoneId;
    state.systemAudioMode.value = settings.systemAudio ? 'on' : 'off';
    state.countdownSeconds.value = settings.countdownSeconds;
    hideTaskbar.value = settings.hideTaskbar;
    hideDesktopIcons.value = settings.hideDesktopIcons;
    showRealCursor.value = settings.showRealCursor;
    void capture
      .updatePreferences({
        extras: {
          recordingCountdownSeconds: settings.countdownSeconds,
          hideTaskbar: settings.hideTaskbar,
          hideDesktopIcons: settings.hideDesktopIcons,
          showRealCursor: settings.showRealCursor,
        },
      })
      .catch((reason) => {
        state.error.value = String(reason);
      });
  };
  const hydrate = (preferences: PreferenceSettings) => {
    const countdown = preferences.extras.recordingCountdownSeconds;
    state.countdownSeconds.value =
      typeof countdown === 'number' && Number.isInteger(countdown) && countdown >= 0 && countdown <= 10 ? countdown : 3;
    hideTaskbar.value = preferences.extras.hideTaskbar === true;
    hideDesktopIcons.value = preferences.extras.hideDesktopIcons === true;
    showRealCursor.value = preferences.extras.showRealCursor === true;
  };
  return { snapshot, apply, hydrate, hideTaskbar, hideDesktopIcons, showRealCursor };
}
