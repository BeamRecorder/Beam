import { computed, onBeforeUnmount, ref, watch, type Ref } from 'vue';
import { capture } from '~/api/capture';
import type { CaptureMode } from '@beam/engine/capture/capture-mode';
import type { PreferenceSettings } from '~/api/types/capture-api';
import type { RecordingConfiguration } from './recorder/recording-types';
import { preparationSettings } from './recorder/preparation-settings';
import type { RegionRecordingSettings } from '~/api/types/screen-region';
import { recordingZoomMode } from '@beam/engine/zoom/recording-zoom-preference';
import { playScreenshotSound } from '~/utils/screenshot-sound';
import type { PrepareRecording } from './recorder/capture-preparation-types';
import { useTranslate } from '~/i18n/useTranslate';

export function useHudCaptureMode(
  busy: Ref<boolean>,
  error: Ref<string>,
  embedded: boolean,
  isRecorderLauncher: () => boolean = () => false,
  prepareRecording?: PrepareRecording,
) {
  const { t } = useTranslate('HudPreferences');
  const preferredMode = ref<CaptureMode>('studio');
  const captureMode = computed({
    get: () => (isRecorderLauncher() ? 'studio' : preferredMode.value),
    set: (mode: CaptureMode) => {
      preferredMode.value = mode;
    },
  });
  const modeShortcut = ref('Alt+Shift+S');
  let hydrated = false;
  const startAutomatically = ref(true);
  const zoomMode = ref<RegionRecordingSettings['zoomMode']>('2d');
  const hydrateMode = (preferences: PreferenceSettings) => {
    zoomMode.value = recordingZoomMode(preferences.extras?.recordingZoomMode);
    startAutomatically.value = preferences.extras?.recordingStartAutomatically !== false;
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
  let preparing = false;
  const prepareCapture: PrepareRecording = async (request, start) => {
    if (preparing) return;
    if (captureMode.value === 'screenshot' || startAutomatically.value) return start(request.settings);
    if (!prepareRecording) throw new Error(t('preparationUnavailable'));
    preparing = true;
    busy.value = true;
    try {
      return await prepareRecording(request, async (settings) => {
        busy.value = false;
        await start(settings);
      });
    } catch (reason) {
      error.value = reason instanceof Error ? reason.message : String(reason);
      throw reason;
    } finally {
      preparing = false;
      busy.value = false;
    }
  };
  const captureWithMode = async (
    configuration: RecordingConfiguration,
    studio: (config: RecordingConfiguration) => void,
    applySettings: (settings: RegionRecordingSettings) => void = () => {},
  ) => {
    const mode = captureMode.value;
    const manual = mode !== 'screenshot' && !startAutomatically.value;
    const request = {
      settings: { ...preparationSettings(configuration), zoomMode: zoomMode.value },
    };
    return prepareCapture(request, async (settings) => {
      if (manual) applySettings(settings);
      const config = manual ? { ...configuration, ...settings } : configuration;
      if (mode === 'studio') {
        studio(config);
        return;
      }
      busy.value = true;
      error.value = '';
      try {
        if (mode === 'instant') {
          await capture.quickSnipFromHud({
            screenKind: config.screenKind,
            screenId: config.screenId,
            region: config.region,
            countdownSeconds: config.countdownSeconds,
            hideTaskbar: config.hideTaskbar,
            hideDesktopIcons: config.hideDesktopIcons,
            showRealCursor: config.showRealCursor,
            regionBounds: config.regionOverlay?.bounds,
            devices: {
              cameraId: config.cameraId,
              micId: config.microphoneId,
              systemAudioMode: config.systemAudio ? 'on' : 'off',
            },
          });
          capture.setWindowVisible(false);
        } else {
          capture.setCameraOverlayActive(false);
          capture.setWindowVisible(false);
          await capture.prepareRecordingSurface();
          const screenshot = await capture.captureScreenshot({
            screenKind: config.screenKind ?? 'display',
            screenId: config.screenId,
            region: config.region,
          });
          capture.setWindowVisible(true);
          if (screenshot === null) return;
          await playScreenshotSound();
          await capture.openScreenshot(screenshot.id);
        }
      } catch (reason) {
        error.value = reason instanceof Error ? reason.message : String(reason);
        if (mode === 'instant') capture.showHud();
        else capture.setWindowVisible(true);
      } finally {
        busy.value = false;
      }
    });
  };
  onBeforeUnmount(() => unsubscribe?.());
  return { captureMode, modeShortcut, hydrateMode, captureWithMode, prepareCapture, startAutomatically };
}
