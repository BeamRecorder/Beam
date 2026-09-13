import { computed, onBeforeUnmount, ref, watch, type Ref } from 'vue';
import { capture } from '~/api/capture';
import type { CaptureMode } from '~/api/types/capture-mode';
import type { PreferenceSettings } from '~/api/types/capture-api';
import type { RecordingConfiguration } from './recorder/recording-types';

export function useHudCaptureMode(
  busy: Ref<boolean>,
  error: Ref<string>,
  embedded: boolean,
  isRecorderLauncher: () => boolean = () => false,
) {
  const preferredMode = ref<CaptureMode>('studio');
  const captureMode = computed({
    get: () => (isRecorderLauncher() ? 'studio' : preferredMode.value),
    set: (mode: CaptureMode) => {
      preferredMode.value = mode;
    },
  });
  const modeShortcut = ref('Alt+Shift+S');
  let hydrated = false;
  const hydrateMode = (preferences: PreferenceSettings) => {
    const mode = preferences.extras?.captureMode;
    preferredMode.value = mode === 'instant' || mode === 'screenshot' ? mode : 'studio';
    modeShortcut.value = preferences.shortcuts?.['quickSnip.toggle']?.keys ?? '';
    hydrated = true;
  };
  watch(preferredMode, (mode) => {
    if (!hydrated || embedded) return;
    void capture.updatePreferences({ extras: { captureMode: mode } }).catch((reason) => {
      error.value = String(reason);
    });
  });
  watch(captureMode, (mode) => {
    if (embedded) return;
    capture.setCameraOverlayActive(mode !== 'screenshot');
    if (mode === 'screenshot') capture.hideTeleprompter();
  });
  const unsubscribe = embedded ? null : capture.onPreferencesChanged(hydrateMode);
  const captureWithMode = async (
    configuration: RecordingConfiguration,
    studio: (config: RecordingConfiguration) => void,
  ) => {
    if (captureMode.value === 'studio') {
      studio(configuration);
      return;
    }
    busy.value = true;
    error.value = '';
    try {
      if (captureMode.value === 'instant') {
        await capture.quickSnipFromHud({
          screenKind: configuration.screenKind,
          screenId: configuration.screenId,
          region: configuration.region,
          devices: {
            cameraId: configuration.cameraId,
            micId: configuration.microphoneId,
            systemAudioMode: configuration.systemAudio ? 'on' : 'off',
          },
        });
        capture.setWindowVisible(false);
      } else {
        capture.setCameraOverlayActive(false);
        capture.setWindowVisible(false);
        await capture.prepareRecordingSurface();
        const screenshot = await capture.captureScreenshot({
          screenKind: configuration.screenKind ?? 'display',
          screenId: configuration.screenId,
          region: configuration.region,
        });
        capture.setWindowVisible(true);
        if (screenshot === null) return;
        await capture.openScreenshot(screenshot.id);
      }
    } catch (reason) {
      error.value = reason instanceof Error ? reason.message : String(reason);
      capture.setWindowVisible(true);
    } finally {
      busy.value = false;
    }
  };
  onBeforeUnmount(() => unsubscribe?.());
  return { captureMode, modeShortcut, hydrateMode, captureWithMode };
}
