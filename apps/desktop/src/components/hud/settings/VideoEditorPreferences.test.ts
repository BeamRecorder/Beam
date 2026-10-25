import { createPinia, setActivePinia } from 'pinia';
import { enableAutoUnmount, flushPromises, mount } from '@vue/test-utils';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import VideoEditorPreferences from './VideoEditorPreferences.vue';
import { usePreferencesStore } from '~/stores/preferences';
import { setCurrentLocale } from '~/i18n';
const capture = vi.hoisted(() => ({
  platform: 'linux',
  canLaunchAtStartup: true,
  getPreferences: vi.fn(),
  updatePreferences: vi.fn(),
  onPreferencesChanged: vi.fn(() => vi.fn()),
  openOnboarding: vi.fn(),
}));
vi.mock('~/api/capture', () => ({ capture }));
enableAutoUnmount(afterEach);
const create = () => mount(VideoEditorPreferences);
beforeEach(() => {
  setActivePinia(createPinia());
  vi.clearAllMocks();
  capture.platform = 'linux';
  capture.canLaunchAtStartup = true;
  capture.getPreferences
    .mockReset()
    .mockResolvedValue({ shortcuts: {}, extras: { videoExportBackend: 'ffmpeg-vaapi' } });
  capture.updatePreferences.mockReset().mockImplementation(async (patch) => ({ shortcuts: {}, extras: patch.extras }));
});

it('restores and saves the same Linux video export preference as the editor', async () => {
  const wrapper = create();
  await flushPromises();
  const toggle = wrapper.get('[data-setting="video-export-backend"] [role="switch"]');
  expect(toggle.attributes('aria-checked')).toBe('true');
  await toggle.trigger('click');
  await flushPromises();
  expect(capture.updatePreferences).toHaveBeenCalledWith({ extras: { videoExportBackend: 'webcodecs' } });
  expect(toggle.attributes('aria-checked')).toBe('false');
  usePreferencesStore().settings!.extras.videoExportBackend = 'ffmpeg-vaapi';
  await flushPromises();
  expect(toggle.attributes('aria-checked')).toBe('true');
});

it('displays failed saves and retains the saved selection', async () => {
  const wrapper = create();
  await flushPromises();
  capture.updatePreferences.mockRejectedValue(new Error('disk full'));
  await wrapper.get('[data-setting="video-export-backend"] [role="switch"]').trigger('click');
  await flushPromises();
  expect(wrapper.get('[role="alert"]').text()).toContain('disk full');
  expect(wrapper.get('[data-setting="video-export-backend"] [role="switch"]').attributes('aria-checked')).toBe('true');
});

it('disables the switch while loading and displays load failures', async () => {
  capture.getPreferences.mockRejectedValue(new Error('preferences unavailable'));
  const wrapper = create();
  expect(wrapper.get('[data-setting="video-export-backend"] [role="switch"]').attributes('disabled')).toBeDefined();
  await flushPromises();
  expect(wrapper.get('[role="alert"]').text()).toContain('preferences unavailable');
  expect(wrapper.get('[data-setting="video-export-backend"] [role="switch"]').attributes('disabled')).toBeDefined();
});

it.each(['win32', 'darwin'])('hides the Linux video backend on %s', async (platform) => {
  capture.platform = platform;
  // A Linux export preference copied to another OS must not expose its switch.
  await usePreferencesStore().load();
  capture.getPreferences.mockClear();
  const wrapper = create();
  await flushPromises();
  expect(wrapper.find('[data-setting="video-export-backend"]').exists()).toBe(false);
  // No Linux-specific preference request is made on other platforms.
  expect(capture.getPreferences).not.toHaveBeenCalled();
});

it('translates the persisted export choice into French', async () => {
  await setCurrentLocale('fr');
  const wrapper = create();
  await flushPromises();
  expect(wrapper.get('[data-setting="video-export-backend"]').text()).toContain('FFmpeg GPU (expérimental)');
  expect(wrapper.text()).toContain('y compris Quick Snip');
});
