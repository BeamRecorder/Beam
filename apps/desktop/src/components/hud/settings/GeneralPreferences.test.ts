import { createPinia, setActivePinia } from 'pinia';
import { enableAutoUnmount, flushPromises, mount } from '@vue/test-utils';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
const capture = vi.hoisted(() => ({
  platform: 'linux',
  canLaunchAtStartup: true,
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
import { i18n, setCurrentLocale } from '~/i18n';
import { SUPPORTED_LOCALES } from '~/i18n/locales';
enableAutoUnmount(afterEach);
const create = () => mount(GeneralPreferences, { global: { stubs: { AppearanceSettings: true } } });
beforeEach(() => {
  setActivePinia(createPinia());
  vi.clearAllMocks();
  capture.platform = 'linux';
  capture.canLaunchAtStartup = true;
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

it.each(['linux', 'win32', 'darwin'])('defaults startup on and saves both choices on %s', async (platform) => {
  capture.platform = platform;
  capture.getPreferences.mockResolvedValue({ launchAtStartup: true, extras: {} });
  capture.updatePreferences.mockImplementation(async (patch) => ({
    launchAtStartup: patch.launchAtStartup,
    extras: {},
  }));
  await usePreferencesStore().load();
  capture.getPreferences.mockClear();
  const wrapper = create();
  await flushPromises();
  const toggle = wrapper.get('[data-setting="launch-at-startup"] [role="switch"]');
  expect(toggle.attributes('aria-checked')).toBe('true');
  await toggle.trigger('click');
  await flushPromises();
  expect(capture.updatePreferences).toHaveBeenLastCalledWith({ launchAtStartup: false });
  expect(toggle.attributes('aria-checked')).toBe('false');
  await toggle.trigger('click');
  await flushPromises();
  expect(capture.updatePreferences).toHaveBeenLastCalledWith({ launchAtStartup: true });
  expect(capture.getPreferences).toHaveBeenCalledOnce();
});
it('retains the saved startup state and shows an OS failure, then permits a retry', async () => {
  capture.getPreferences.mockResolvedValue({ launchAtStartup: false, extras: {} });
  capture.updatePreferences
    .mockRejectedValueOnce(new Error('OS permission denied'))
    .mockResolvedValue({ launchAtStartup: true, extras: {} });
  const wrapper = create();
  await flushPromises();
  const toggle = wrapper.get('[data-setting="launch-at-startup"] [role="switch"]');
  await toggle.trigger('click');
  await flushPromises();
  expect(wrapper.get('[role="alert"]').text()).toContain('OS permission denied');
  expect(toggle.attributes('aria-checked')).toBe('false');
  await toggle.trigger('click');
  await flushPromises();
  expect(toggle.attributes('aria-checked')).toBe('true');
  expect(wrapper.find('[role="alert"]').exists()).toBe(false);
});
it('disables startup while saving and ignores overlapping requests', async () => {
  const wrapper = create();
  await flushPromises();
  let resolve!: (value: { launchAtStartup: boolean; extras: Record<string, never> }) => void;
  capture.updatePreferences.mockReturnValue(
    new Promise((done) => {
      resolve = done;
    }),
  );
  const controls = wrapper.findAllComponents({ name: 'TogglePreference' });
  controls[0]!.vm.$emit('update:modelValue', false);
  await flushPromises();
  expect(wrapper.get('[data-setting="launch-at-startup"] [role="switch"]').attributes('disabled')).toBeDefined();
  controls[0]!.vm.$emit('update:modelValue', false);
  expect(capture.updatePreferences).toHaveBeenCalledOnce();
  resolve({ launchAtStartup: false, extras: {} });
  await flushPromises();
  expect(wrapper.get('[data-setting="launch-at-startup"] [role="switch"]').attributes('disabled')).toBeUndefined();
});
it('keeps development startup disabled with an installed-app explanation', async () => {
  capture.canLaunchAtStartup = false;
  const wrapper = create();
  await flushPromises();
  const toggle = wrapper.get('[data-setting="launch-at-startup"] [role="switch"]');
  expect(toggle.attributes('disabled')).toBeDefined();
  expect(wrapper.get('[data-setting="launch-at-startup"]').text()).toMatch(/install/i);
  wrapper.findAllComponents({ name: 'TogglePreference' })[0]!.vm.$emit('update:modelValue', false);
  expect(capture.updatePreferences).not.toHaveBeenCalled();
});
it('does not update startup before preferences finish loading', async () => {
  capture.getPreferences.mockReturnValue(new Promise(() => {}));
  const wrapper = create();
  expect(wrapper.get('[data-setting="launch-at-startup"] [role="switch"]').attributes('disabled')).toBeDefined();
  wrapper.findAllComponents({ name: 'TogglePreference' })[0]!.vm.$emit('update:modelValue', false);
  expect(capture.updatePreferences).not.toHaveBeenCalled();
});

it.each(['linux', 'win32', 'darwin'])(
  'places tray close below startup and saves both choices on %s',
  async (platform) => {
    await setCurrentLocale('en');
    capture.platform = platform;
    capture.getPreferences.mockResolvedValue({ extras: {} });
    capture.updatePreferences.mockImplementation(async (patch) => ({
      minimizeToTray: patch.minimizeToTray,
      extras: {},
    }));
    await usePreferencesStore().load();
    const wrapper = create();
    await flushPromises();
    const setting = wrapper.get('[data-setting="minimize-to-tray"]');
    expect(setting.element.previousElementSibling?.getAttribute('data-setting')).toBe('launch-at-startup');
    expect(setting.text()).toContain('system tray');
    expect(setting.text()).toContain('launch it again');
    const toggle = setting.get('[role="switch"]');
    expect(toggle.attributes('aria-checked')).toBe('false');
    for (const enabled of [true, false]) {
      await toggle.trigger('click');
      await flushPromises();
      expect(capture.updatePreferences).toHaveBeenLastCalledWith({ minimizeToTray: enabled });
      expect(toggle.attributes('aria-checked')).toBe(String(enabled));
    }
  },
);

it('restores the saved tray choice and responds to later preference changes', async () => {
  capture.getPreferences.mockResolvedValue({ minimizeToTray: true, extras: {} });
  const wrapper = create();
  await flushPromises();
  const toggle = wrapper.get('[data-setting="minimize-to-tray"] [role="switch"]');
  expect(toggle.attributes('aria-checked')).toBe('true');
  usePreferencesStore().settings!.minimizeToTray = false;
  await flushPromises();
  expect(toggle.attributes('aria-checked')).toBe('false');
});

it('retains the saved tray choice after a failed save and allows retry', async () => {
  capture.getPreferences.mockResolvedValue({ minimizeToTray: false, extras: {} });
  capture.updatePreferences
    .mockRejectedValueOnce(new Error('disk full'))
    .mockResolvedValue({ minimizeToTray: true, extras: {} });
  const wrapper = create();
  await flushPromises();
  const toggle = wrapper.get('[data-setting="minimize-to-tray"] [role="switch"]');
  await toggle.trigger('click');
  await flushPromises();
  expect(toggle.attributes('aria-checked')).toBe('false');
  expect(wrapper.get('[data-setting="minimize-to-tray"] [role="alert"]').text()).toContain('disk full');
  await toggle.trigger('click');
  await flushPromises();
  expect(toggle.attributes('aria-checked')).toBe('true');
  expect(wrapper.find('[data-setting="minimize-to-tray"] [role="alert"]').exists()).toBe(false);
});

it('disables tray close while saving and ignores overlapping updates', async () => {
  const wrapper = create();
  await flushPromises();
  let resolve!: (value: { minimizeToTray: boolean; extras: Record<string, never> }) => void;
  capture.updatePreferences.mockReturnValue(
    new Promise((done) => {
      resolve = done;
    }),
  );
  const control = wrapper.get('[data-setting="minimize-to-tray"]').getComponent({ name: 'TogglePreference' });
  control.vm.$emit('update:modelValue', true);
  await flushPromises();
  expect(control.get('[role="switch"]').attributes('disabled')).toBeDefined();
  expect(control.classes()).not.toContain('is-disabled');
  expect(control.get('[role="switch"]').attributes('aria-busy')).toBe('true');
  expect(control.get('.switch-container').classes()).not.toContain('is-disabled');
  control.vm.$emit('update:modelValue', true);
  expect(capture.updatePreferences).toHaveBeenCalledOnce();
  resolve({ minimizeToTray: true, extras: {} });
  await flushPromises();
  expect(control.get('[role="switch"]').attributes('disabled')).toBeUndefined();
  expect(control.get('[role="switch"]').attributes('aria-busy')).toBeUndefined();
  expect(control.get('[role="switch"]').attributes('aria-checked')).toBe('true');
});

it.each(SUPPORTED_LOCALES)('renders the tray-close label and both closing outcomes in %s', async (locale) => {
  await setCurrentLocale(locale);
  const wrapper = create();
  await flushPromises();
  const setting = wrapper.get('[data-setting="minimize-to-tray"]');
  const label = i18n.global.t('HudPreferences.minimizeToTray');
  expect(setting.get('[role="switch"]').attributes('aria-label')).toBe(label);
  expect(setting.get('.preference-description').text()).toBe(i18n.global.t('HudPreferences.minimizeToTrayDescription'));
  if (locale !== 'en') expect(label).not.toBe('Minimize to tray on close');
});

it('does not save tray close before preferences finish loading', async () => {
  capture.getPreferences.mockReturnValue(new Promise(() => {}));
  const wrapper = create();
  const control = wrapper.get('[data-setting="minimize-to-tray"]').getComponent({ name: 'TogglePreference' });
  expect(control.get('[role="switch"]').attributes('disabled')).toBeDefined();
  control.vm.$emit('update:modelValue', true);
  expect(capture.updatePreferences).not.toHaveBeenCalled();
});
