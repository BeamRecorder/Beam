import { expect, it } from 'vitest';
import { preparationPreferences, preparationSettings } from './preparation-settings';
import type { RecordingConfiguration } from './recording-types';
const base: RecordingConfiguration = {
  screenKind: 'window',
  screenId: 'window:99',
  cameraId: 'cam',
  microphoneId: 'mic',
  systemAudio: true,
  countdownSeconds: 10,
  targetFps: 60,
  recordingBarVisibility: 'always',
};
it('creates plain editable settings without including or changing the source', () => {
  expect(preparationSettings(base)).toEqual({
    cameraId: 'cam',
    microphoneId: 'mic',
    systemAudio: true,
    countdownSeconds: 10,
    hideTaskbar: false,
    hideDesktopIcons: false,
    showRealCursor: false,
  });
});
it.each([true, false])('preserves explicit desktop visibility and cursor choices: %s', (value) => {
  const settings = preparationSettings({ ...base, hideTaskbar: value, hideDesktopIcons: value, showRealCursor: value });
  expect(settings).toMatchObject({ hideTaskbar: value, hideDesktopIcons: value, showRealCursor: value });
});
it('saves all editable choices as a narrow patch without overwriting the start policy or source', () => {
  const patch = preparationPreferences({ ...preparationSettings(base), zoomMode: '3d' });
  expect(patch.devices).toEqual({ cameraId: 'cam', micId: 'mic', systemAudioMode: 'on' });
  expect(patch.extras).toEqual({
    recordingZoomMode: '3d',
    recordingCountdownSeconds: 10,
    hideTaskbar: false,
    hideDesktopIcons: false,
    showRealCursor: false,
  });
});
it('keeps an absent zoom preference out of the patch and preserves explicit system-audio Off', () => {
  const patch = preparationPreferences({ ...preparationSettings(base), systemAudio: false, countdownSeconds: 0 });
  expect(patch.devices?.systemAudioMode).toBe('off');
  expect(patch.extras).not.toHaveProperty('recordingZoomMode');
  expect(patch.extras?.recordingCountdownSeconds).toBe(0);
});
