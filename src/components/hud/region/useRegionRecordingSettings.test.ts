import { ref } from 'vue';
import { flushPromises } from '@vue/test-utils';
import { beforeEach, describe, expect, it, vi } from 'vitest';
const { updatePreferences } = vi.hoisted(() => ({ updatePreferences: vi.fn() }));
vi.mock('~/api/capture', () => ({ capture: { updatePreferences } }));
import { useRegionRecordingSettings } from './useRegionRecordingSettings';
import type { PreferenceSettings } from '~/api/types/capture-api';
import type { HudRegionSettingRefs } from './region-settings-types';
const state = (): HudRegionSettingRefs => ({
  cameraId: ref('off'),
  microphoneId: ref('no-audio'),
  systemAudioMode: ref('off'),
  countdownSeconds: ref(3),
  error: ref(''),
});
const prefs = (extras: Record<string, unknown>) => ({ extras }) as PreferenceSettings;
beforeEach(() => {
  updatePreferences.mockReset().mockResolvedValue({});
});
it('snapshots independent device, audio, countdown and desktop settings', () => {
  const refs = state();
  const settings = useRegionRecordingSettings(refs);
  expect(settings.snapshot()).toEqual({
    cameraId: 'off',
    microphoneId: 'no-audio',
    systemAudio: false,
    countdownSeconds: 3,
    hideTaskbar: false,
    hideDesktopIcons: false,
  });
  refs.systemAudioMode.value = 'on';
  expect(settings.snapshot().systemAudio).toBe(true);
});
it('applies chosen settings and persists countdown and desktop options', async () => {
  const refs = state();
  const settings = useRegionRecordingSettings(refs);
  const next = {
    cameraId: 'camera',
    microphoneId: 'mic',
    systemAudio: true,
    countdownSeconds: 10,
    hideTaskbar: true,
    hideDesktopIcons: true,
  };
  settings.apply(next);
  await flushPromises();
  expect(settings.snapshot()).toEqual(next);
  expect(updatePreferences).toHaveBeenCalledWith({
    extras: { recordingCountdownSeconds: 10, hideTaskbar: true, hideDesktopIcons: true },
  });
  settings.apply({ ...next, systemAudio: false });
  expect(refs.systemAudioMode.value).toBe('off');
});
it('surfaces persistence failures while keeping the chosen recording settings', async () => {
  updatePreferences.mockRejectedValue(new Error('Cannot save'));
  const refs = state();
  const settings = useRegionRecordingSettings(refs);
  settings.apply({ ...settings.snapshot(), countdownSeconds: 1 });
  await flushPromises();
  expect(refs.error.value).toBe('Error: Cannot save');
  expect(settings.snapshot().countdownSeconds).toBe(1);
});
describe('hydrate', () => {
  it.each([0, 1, 4, 10])('restores supported countdown %s', (seconds) => {
    const settings = useRegionRecordingSettings(state());
    settings.hydrate(prefs({ recordingCountdownSeconds: seconds, hideTaskbar: true, hideDesktopIcons: true }));
    expect(settings.snapshot().countdownSeconds).toBe(seconds);
    expect(settings.snapshot().hideTaskbar).toBe(true);
    expect(settings.snapshot().hideDesktopIcons).toBe(true);
  });
  it.each([undefined, -1, 11, 1.5, '5', NaN])('rejects malformed countdown %s', (seconds) => {
    const settings = useRegionRecordingSettings(state());
    settings.hydrate(prefs({ recordingCountdownSeconds: seconds, hideTaskbar: 'yes', hideDesktopIcons: 1 }));
    expect(settings.snapshot().countdownSeconds).toBe(3);
    expect(settings.snapshot().hideTaskbar).toBe(false);
    expect(settings.snapshot().hideDesktopIcons).toBe(false);
  });
});
