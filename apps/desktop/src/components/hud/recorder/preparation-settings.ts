import type { RecordingConfiguration } from './recording-types';
import type { RegionRecordingSettings } from '~/api/types/screen-region';
import type { PreferencePatch } from '~/api/types/preferences';
export const preparationSettings = (configuration: RecordingConfiguration): RegionRecordingSettings => ({
  cameraId: configuration.cameraId,
  microphoneId: configuration.microphoneId,
  systemAudio: configuration.systemAudio,
  countdownSeconds: configuration.countdownSeconds,
  hideTaskbar: configuration.hideTaskbar === true,
  hideDesktopIcons: configuration.hideDesktopIcons === true,
  showRealCursor: configuration.showRealCursor === true,
});
export const preparationPreferences = (settings: RegionRecordingSettings): PreferencePatch => ({
  devices: {
    cameraId: settings.cameraId,
    micId: settings.microphoneId,
    systemAudioMode: settings.systemAudio ? 'on' : 'off',
  },
  extras: {
    recordingCountdownSeconds: settings.countdownSeconds,
    ...(settings.zoomMode !== undefined ? { recordingZoomMode: settings.zoomMode } : {}),
    hideTaskbar: settings.hideTaskbar,
    hideDesktopIcons: settings.hideDesktopIcons,
    showRealCursor: settings.showRealCursor,
  },
});
