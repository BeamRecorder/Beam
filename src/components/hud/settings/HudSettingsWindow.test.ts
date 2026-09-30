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
  props: ['view', 'countdownSeconds', 'recordingBarVisibility', 'inputAccess', 'recordInteractions'],
  template: '<div />',
};
beforeEach(() => {
  vi.clearAllMocks();
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
});
const create = async () => {
  const wrapper = mount(HudSettingsWindow, { global: { stubs: { HudPreferences: stub } } });
  await flushPromises();
  return wrapper;
};
describe('separate HUD settings', () => {
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
  it('navigates the settings pages and closes only its own window', async () => {
    const wrapper = await create();
    for (const [index, view] of ['general', 'shortcuts', 'about'].entries()) {
      await wrapper.findAll('nav button')[index]!.trigger('click');
      expect(wrapper.getComponent(stub).props('view')).toBe(view);
    }
    wrapper.getComponent(stub).vm.$emit('update:view', 'general');
    await flushPromises();
    wrapper.getComponent(stub).vm.$emit('close');
    expect(mocks.capture.close).toHaveBeenCalledOnce();
    wrapper.unmount();
  });
});
