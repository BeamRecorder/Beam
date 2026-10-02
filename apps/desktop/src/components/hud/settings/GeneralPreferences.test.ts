import { createPinia, setActivePinia } from 'pinia';
import { enableAutoUnmount, flushPromises, mount } from '@vue/test-utils';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
const capture = vi.hoisted(() => ({
  platform: 'linux',
  getPreferences: vi.fn(),
  updatePreferences: vi.fn(),
  onPreferencesChanged: vi.fn(() => vi.fn()),
  openOnboarding: vi.fn(),
}));
vi.mock('~/api/capture', () => ({ capture }));
import GeneralPreferences from './GeneralPreferences.vue';
import { usePreferencesStore } from '~/stores/preferences';
import { useLocaleStore } from '~/stores/locale';
import Select from '~/ui/select/Select.vue';
import { setCurrentLocale } from '~/i18n';
enableAutoUnmount(afterEach);
const create = () => mount(GeneralPreferences, { global: { stubs: { AppearanceSettings: true } } });
beforeEach(() => {
  setActivePinia(createPinia());
  vi.clearAllMocks();
  capture.platform = 'linux';
  capture.getPreferences.mockReset().mockResolvedValue({ extras: { videoExportBackend: 'ffmpeg-vaapi' } });
  capture.updatePreferences.mockReset().mockImplementation(async (patch) => ({ extras: patch.extras }));
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
  await wrapper.get('[role="switch"]').trigger('click');
  await flushPromises();
  expect(wrapper.get('[role="alert"]').text()).toContain('disk full');
  expect(wrapper.get('[role="switch"]').attributes('aria-checked')).toBe('true');
});

it('disables the switch while loading and displays load failures', async () => {
  capture.getPreferences.mockRejectedValue(new Error('preferences unavailable'));
  const wrapper = create();
  expect(wrapper.get('[role="switch"]').attributes('disabled')).toBeDefined();
  await flushPromises();
  expect(wrapper.get('[role="alert"]').text()).toContain('preferences unavailable');
  expect(wrapper.get('[role="switch"]').attributes('disabled')).toBeDefined();
});

it.each(['win32', 'darwin'])('hides the Linux video backend on %s', async (platform) => {
  capture.platform = platform;
  const wrapper = create();
  await flushPromises();
  expect(wrapper.find('[data-setting="video-export-backend"]').exists()).toBe(false);
  // The locale store hydrates on every platform; the export preference adds no read.
  expect(capture.getPreferences).toHaveBeenCalledOnce();
});

it('translates the persisted export choice into French', async () => {
  await setCurrentLocale('fr');
  const wrapper = create();
  await flushPromises();
  expect(wrapper.get('[data-setting="video-export-backend"]').text()).toContain('FFmpeg GPU (expérimental)');
  expect(wrapper.text()).toContain('y compris Quick Snip');
});

it('preserves language validation and the onboarding action', async () => {
  const locale = useLocaleStore();
  const setLocale = vi.spyOn(locale, 'setLocale').mockResolvedValue(undefined);
  const wrapper = create();
  const select = wrapper.getComponent(Select);
  select.vm.$emit('update:modelValue', 42);
  select.vm.$emit('update:modelValue', 'invalid');
  expect(setLocale).not.toHaveBeenCalled();
  select.vm.$emit('update:modelValue', 'fr');
  expect(setLocale).toHaveBeenCalledWith('fr');
  await wrapper.get('[data-setting="onboarding"] button').trigger('click');
  expect(capture.openOnboarding).toHaveBeenCalledOnce();
  expect(wrapper.emitted('close')).toEqual([[]]);
});
