import { createPinia, setActivePinia } from 'pinia';
import { defineComponent, h } from 'vue';
import { enableAutoUnmount, flushPromises, mount } from '@vue/test-utils';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import type { PreferenceSettings } from '~/api/types/capture-api';
const capture = vi.hoisted(() => ({
  platform: 'linux',
  getPreferences: vi.fn(),
  updatePreferences: vi.fn(),
  onPreferencesChanged: vi.fn(),
}));
vi.mock('~/api/capture', () => ({ capture }));
import { useExportBackendPreference } from '../useExportBackendPreference';
import { usePreferencesStore } from '~/stores/preferences';

const settings = (videoExportBackend?: string): PreferenceSettings => ({
  schemaVersion: 3,
  theme: 'light',
  recordingBar: { visibility: 'always' },
  recordingInteractions: { enabled: false, noticeDismissed: false },
  devices: {},
  shortcuts: {},
  backgroundPresets: { colors: [], gradients: [] },
  extras: { videoExportBackend },
});
const deferred = <T>() => {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
};
const harness = () => {
  let preference!: ReturnType<typeof useExportBackendPreference>;
  const wrapper = mount(
    defineComponent({
      setup() {
        preference = useExportBackendPreference();
        return () => h('div');
      },
    }),
  );
  return { preference, wrapper };
};
enableAutoUnmount(afterEach);
beforeEach(() => {
  setActivePinia(createPinia());
  capture.platform = 'linux';
  capture.getPreferences.mockReset().mockResolvedValue(settings());
  capture.updatePreferences.mockReset();
  capture.onPreferencesChanged.mockReset().mockReturnValue(vi.fn());
});

it('loads the default without enabling the native backend and blocks changes during loading', async () => {
  const pending = deferred<PreferenceSettings>();
  capture.getPreferences.mockReturnValue(pending.promise);
  const { preference } = harness();
  expect(preference.available).toBe(true);
  expect(preference.busy.value).toBe(true);
  expect(preference.ready.value).toBe(false);
  await preference.setEnabled(true);
  expect(capture.updatePreferences).not.toHaveBeenCalled();
  pending.resolve(settings());
  await flushPromises();
  expect(preference.busy.value).toBe(false);
  expect(preference.ready.value).toBe(true);
  expect(preference.enabled.value).toBe(false);
});

it('restores the saved backend and reuses hydrated preferences after reopening', async () => {
  capture.getPreferences.mockResolvedValue(settings('ffmpeg-vaapi'));
  const first = harness();
  await flushPromises();
  expect(first.preference.enabled.value).toBe(true);
  first.wrapper.unmount();
  const second = harness();
  await flushPromises();
  expect(second.preference.enabled.value).toBe(true);
  expect(second.preference.busy.value).toBe(false);
  expect(capture.getPreferences).toHaveBeenCalledOnce();
});

it('persists both choices through the shared preference service', async () => {
  const { preference } = harness();
  await flushPromises();
  for (const enabled of [true, false, true]) {
    const backend = enabled ? 'ffmpeg-vaapi' : 'webcodecs';
    capture.updatePreferences.mockResolvedValue(settings(backend));
    await preference.setEnabled(enabled);
    expect(capture.updatePreferences).toHaveBeenLastCalledWith({ extras: { videoExportBackend: backend } });
    expect(preference.enabled.value).toBe(enabled);
    expect(preference.error.value).toBe('');
    expect(preference.busy.value).toBe(false);
  }
});

it('reflects broadcasts from another desktop window', async () => {
  const { preference } = harness();
  await flushPromises();
  const changed = capture.onPreferencesChanged.mock.calls[0]![0] as (next: PreferenceSettings) => void;
  changed(settings('ffmpeg-vaapi'));
  expect(preference.enabled.value).toBe(true);
  changed(settings('webcodecs'));
  expect(preference.enabled.value).toBe(false);
});

it('blocks another toggle while persistence is pending', async () => {
  const { preference } = harness();
  await flushPromises();
  const pending = deferred<PreferenceSettings>();
  capture.updatePreferences.mockReturnValue(pending.promise);
  const saving = preference.setEnabled(true);
  expect(preference.busy.value).toBe(true);
  expect(preference.enabled.value).toBe(false);
  await preference.setEnabled(false);
  expect(capture.updatePreferences).toHaveBeenCalledOnce();
  pending.resolve(settings('ffmpeg-vaapi'));
  await saving;
  expect(preference.busy.value).toBe(false);
  expect(preference.enabled.value).toBe(true);
});

it.each(['ffmpeg-vaapi', 'webcodecs'])(
  'retains %s when saving fails and clears the error after retry',
  async (backend) => {
    capture.getPreferences.mockResolvedValue(settings(backend));
    const { preference } = harness();
    await flushPromises();
    const wasEnabled = preference.enabled.value;
    capture.updatePreferences.mockRejectedValue(new Error('disk full'));
    await preference.setEnabled(!wasEnabled);
    expect(preference.enabled.value).toBe(wasEnabled);
    expect(preference.error.value).toContain('disk full');
    expect(preference.busy.value).toBe(false);
    capture.updatePreferences.mockResolvedValue(settings(wasEnabled ? 'webcodecs' : 'ffmpeg-vaapi'));
    await preference.setEnabled(!wasEnabled);
    expect(preference.enabled.value).toBe(!wasEnabled);
    expect(preference.error.value).toBe('');
  },
);

it('exposes a loading error without allowing an unsaved choice', async () => {
  capture.getPreferences.mockRejectedValue(new Error('preferences unavailable'));
  const { preference } = harness();
  await flushPromises();
  expect(preference.error.value).toContain('preferences unavailable');
  expect(preference.ready.value).toBe(false);
  expect(preference.busy.value).toBe(false);
  await preference.setEnabled(true);
  expect(capture.updatePreferences).not.toHaveBeenCalled();
});

it.each(['win32', 'darwin', 'unknown'])('does not load or mutate Linux preferences on %s', async (platform) => {
  capture.platform = platform;
  usePreferencesStore().settings = settings('ffmpeg-vaapi');
  const { preference } = harness();
  await flushPromises();
  expect(preference.available).toBe(false);
  expect(preference.enabled.value).toBe(false);
  expect(preference.ready.value).toBe(true);
  expect(preference.busy.value).toBe(false);
  await preference.setEnabled(false);
  expect(capture.getPreferences).not.toHaveBeenCalled();
  expect(capture.updatePreferences).not.toHaveBeenCalled();
  expect(usePreferencesStore().settings?.extras.videoExportBackend).toBe('ffmpeg-vaapi');
});
