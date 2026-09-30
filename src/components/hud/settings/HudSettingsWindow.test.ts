import { mount, flushPromises } from '@vue/test-utils';
import { reactive } from 'vue';
import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import type { PreferenceSettings } from '~/api/types/capture-api';
const mocks = vi.hoisted(() => ({
  preferences: { settings: null as PreferenceSettings | null, update: vi.fn() },
  capture: {
    platform: 'linux',
    onPreferencesChanged: vi.fn(),
    inputAccessStatus: vi.fn(),
    requestInputAccess: vi.fn(),
    updatePreferences: vi.fn(),
    close: vi.fn(),
  },
}));
vi.mock('~/api/capture', () => ({ capture: mocks.capture }));
vi.mock('~/stores/preferences', () => ({ usePreferencesStore: () => mocks.preferences }));
import HudSettingsWindow from './HudSettingsWindow.vue';
import { setCurrentLocale } from '~/i18n';
const preferences: PreferenceSettings = {
  schemaVersion: 3,
  theme: 'dark',
  recordingBar: { visibility: 'always' },
  recordingInteractions: { enabled: false, noticeDismissed: false },
  devices: {},
  extras: {},
  shortcuts: {},
  backgroundPresets: { colors: [], gradients: [] },
};
const stub = {
  name: 'HudPreferences',
  props: [
    'alwaysOnTop',
    'focusedSetting',
    'view',
    'countdownSeconds',
    'recordingBarVisibility',
    'inputAccess',
    'recordInteractions',
  ],
  template: '<div />',
};
beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(document, 'hasFocus').mockReturnValue(true);
  mocks.preferences.settings = reactive({ ...preferences });
  mocks.preferences.update.mockResolvedValue(preferences);
  mocks.capture.onPreferencesChanged.mockReturnValue(vi.fn());
  mocks.capture.inputAccessStatus.mockResolvedValue({
    state: 'available',
    canRequest: false,
    clicks: true,
    shortcuts: true,
    recordsText: false,
  });
  window.capture = mocks.capture as unknown as NonNullable<typeof window.capture>;
});
afterEach(() => {
  delete window.capture;
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
});
const create = async () => {
  const wrapper = mount(HudSettingsWindow, { attachTo: document.body, global: { stubs: { HudPreferences: stub } } });
  await flushPromises();
  return wrapper;
};
describe('separate HUD settings', () => {
  it.each([true, false])('shows developer navigation only when development is %s', async (development) => {
    vi.stubEnv('DEV', development);
    const wrapper = await create();
    const developer = wrapper.findAll('nav button').find((button) => button.text() === 'Developer');
    expect(Boolean(developer)).toBe(development);
    if (developer) {
      await developer.trigger('click');
      expect(wrapper.getComponent(stub).props('view')).toBe('developer');
    }
    wrapper.unmount();
  });
  it('hydrates settings before announcing readiness and releases listeners on close', async () => {
    mocks.preferences.settings!.extras.recordingCountdownSeconds = 5;
    const wrapper = await create();
    const child = wrapper.getComponent(stub);
    expect(child.props('countdownSeconds')).toBe(5);
    expect(child.props('inputAccess').state).toBe('available');
    expect(wrapper.emitted('ready')).toEqual([[]]);
    const unsubscribe = mocks.capture.onPreferencesChanged.mock.results[0]!.value;
    wrapper.unmount();
    expect(unsubscribe).toHaveBeenCalledOnce();
  });
  it.each([null, 99, '3'])('rejects unsupported countdown preferences (%s)', async (invalid) => {
    mocks.preferences.settings!.extras.recordingCountdownSeconds = invalid;
    const wrapper = await create();
    expect(wrapper.getComponent(stub).props('countdownSeconds')).toBe(3);
    wrapper.unmount();
  });
  it('persists recording preferences and reports failed saves', async () => {
    const wrapper = await create();
    const child = wrapper.getComponent(stub);
    child.vm.$emit('update:countdownSeconds', 10);
    await flushPromises();
    expect(mocks.preferences.update).toHaveBeenCalledWith({ extras: { recordingCountdownSeconds: 10 } });
    child.vm.$emit('update:alwaysOnTop', false);
    await flushPromises();
    expect(mocks.preferences.update).toHaveBeenCalledWith({ alwaysOnTop: false });
    child.vm.$emit('update:recordingBarVisibility', 'hover-only');
    await flushPromises();
    expect(mocks.preferences.update).toHaveBeenCalledWith({ recordingBar: { visibility: 'hover-only' } });
    mocks.preferences.update.mockRejectedValueOnce(new Error('Save failed'));
    child.vm.$emit('update:countdownSeconds', 0);
    await flushPromises();
    expect(wrapper.get('[role="alert"]').text()).toBe('Save failed');
    child.vm.$emit('update:countdownSeconds', 3);
    await flushPromises();
    expect(wrapper.find('[role="alert"]').exists()).toBe(false);
    wrapper.unmount();
  });
  it('refreshes native access on focus and receives authorization changed by another window', async () => {
    const wrapper = await create();
    const listener = mocks.capture.onPreferencesChanged.mock.calls[0]![0];
    listener({ ...preferences, recordingInteractions: { enabled: true, noticeDismissed: true } });
    await flushPromises();
    expect(wrapper.getComponent(stub).props('recordInteractions')).toBe(true);
    mocks.capture.inputAccessStatus.mockRejectedValueOnce('Status failed');
    window.dispatchEvent(new Event('focus'));
    await flushPromises();
    expect(wrapper.get('[role="alert"]').text()).toBe('Status failed');
    wrapper.unmount();
  });
  it('saves interaction recording and clears a failed save on retry', async () => {
    mocks.capture.updatePreferences.mockResolvedValue(preferences);
    const wrapper = await create();
    const child = wrapper.getComponent(stub);
    child.vm.$emit('update:recordInteractions', true);
    await flushPromises();
    expect(mocks.capture.updatePreferences).toHaveBeenLastCalledWith({ recordingInteractions: { enabled: true } });
    mocks.capture.updatePreferences.mockRejectedValueOnce(new Error('Access save failed'));
    child.vm.$emit('update:recordInteractions', false);
    await flushPromises();
    expect(wrapper.get('[role="alert"]').text()).toBe('Access save failed');
    child.vm.$emit('update:recordInteractions', true);
    await flushPromises();
    expect(wrapper.find('[role="alert"]').exists()).toBe(false);
    wrapper.unmount();
  });
  it('reports non-Error failures from both settings persistence paths', async () => {
    const wrapper = await create();
    const child = wrapper.getComponent(stub);
    mocks.preferences.update.mockRejectedValueOnce('Disk unavailable');
    child.vm.$emit('update:countdownSeconds', 3);
    await flushPromises();
    expect(wrapper.get('[role="alert"]').text()).toBe('Disk unavailable');
    mocks.capture.updatePreferences.mockRejectedValueOnce('Access unavailable');
    child.vm.$emit('update:recordInteractions', false);
    await flushPromises();
    expect(wrapper.get('[role="alert"]').text()).toBe('Access unavailable');
    wrapper.unmount();
  });

  it('searches French and English descriptions and opens the exact setting', async () => {
    await setCurrentLocale('fr');
    const wrapper = await create();
    const input = wrapper.get<HTMLInputElement>('input[type="search"]');
    await input.setValue('countdown');
    const result = wrapper.get('[data-search-result="countdown"]');
    expect(result.text()).toContain('Compte à rebours');
    await result.trigger('click');
    expect(wrapper.getComponent(stub).props()).toMatchObject({ view: 'recording', focusedSetting: 'countdown' });
    expect(input.element.value).toBe('');
    await input.setValue('mal orthographies');
    expect(wrapper.find('[data-search-result="spell-check"]').exists()).toBe(true);
    await input.setValue('misspelled');
    expect(wrapper.find('[data-search-result="spell-check"]').exists()).toBe(true);
    wrapper.unmount();
  });

  it('handles empty results, clearing, keyboard search and category navigation during search', async () => {
    const wrapper = await create();
    const input = wrapper.get<HTMLInputElement>('input[type="search"]');
    await input.setValue('unfindable-setting');
    expect(wrapper.get('.search-empty').text()).toContain('No settings match');
    await input.trigger('keydown', { key: 'Escape' });
    expect(wrapper.find('.search-results').exists()).toBe(false);
    await wrapper.trigger('keydown', { key: 'f', ctrlKey: true });
    await wrapper.trigger('keydown', { key: 'f', metaKey: true });
    await input.setValue('theme');
    await wrapper.get('button[aria-label="Clear search"]').trigger('click');
    expect(wrapper.find('.search-results').exists()).toBe(false);
    await input.setValue('theme');
    await wrapper.findAll('nav > .btn-container button')[2]!.trigger('click');
    expect(wrapper.getComponent(stub).props('view')).toBe('accessibility');
    expect(input.element.value).toBe('');
    expect(wrapper.find('nav .btn-tab').exists()).toBe(false);
    expect(wrapper.get('nav [aria-current="page"]').text()).toContain('Accessibility');
    wrapper.unmount();
  });

  it('rebuilds translated results when the language changes and ignores whitespace queries', async () => {
    const wrapper = await create();
    const input = wrapper.get<HTMLInputElement>('input[type="search"]');
    await input.setValue('   ');
    expect(wrapper.find('.search-results').exists()).toBe(false);
    await input.setValue('language');
    expect(wrapper.get('[data-search-result="language"]').text()).toContain('Language');
    await setCurrentLocale('fr');
    await flushPromises();
    expect(wrapper.get('[data-search-result="language"]').text()).toContain('Langue');
    wrapper.unmount();
  });

  it('focuses search on opening and reactivation, and routes typing only in the active window', async () => {
    const wrapper = await create();
    const input = wrapper.get<HTMLInputElement>('input[type="search"]');
    expect(document.activeElement).toBe(input.element);
    const navigation = wrapper.findAll('nav > .btn-container button')[1]!;
    (navigation.element as HTMLButtonElement).focus();
    await navigation.trigger('keydown', { key: 'c' });
    expect(input.element.value).toBe('c');
    expect(document.activeElement).toBe(input.element);
    await input.trigger('keydown', { key: 'o' });
    expect(input.element.value).toBe('c');
    window.dispatchEvent(new Event('blur'));
    await navigation.trigger('keydown', { key: 'x' });
    await wrapper.trigger('keydown', { key: 'Escape' });
    await wrapper.trigger('keydown', { key: 'f', ctrlKey: true });
    expect(input.element.value).toBe('c');
    window.dispatchEvent(new Event('focus'));
    expect(document.activeElement).toBe(input.element);
    await navigation.trigger('keydown', { key: 'm', isComposing: true });
    await navigation.trigger('keydown', { key: 'm', altKey: true });
    await navigation.trigger('keydown', { key: 'm', ctrlKey: true });
    await navigation.trigger('keydown', { key: 'ArrowDown' });
    expect(input.element.value).toBe('c');
    wrapper.unmount();
    (document.body as HTMLElement).focus();
    window.dispatchEvent(new Event('focus'));
    expect(document.activeElement).not.toBe(input.element);
  });

  it('navigates the settings pages and closes only its own window', async () => {
    const wrapper = await create();
    for (const [index, view] of ['general', 'recording', 'accessibility', 'shortcuts', 'updates', 'about'].entries()) {
      await wrapper.findAll('nav > .btn-container button')[index]!.trigger('click');
      expect(wrapper.getComponent(stub).props('view')).toBe(view);
    }
    wrapper.getComponent(stub).vm.$emit('update:view', 'general');
    await flushPromises();
    wrapper.getComponent(stub).vm.$emit('close');
    expect(mocks.capture.close).toHaveBeenCalledOnce();
    wrapper.unmount();
  });
});
