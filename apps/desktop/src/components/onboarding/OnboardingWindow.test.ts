import { createPinia, setActivePinia } from 'pinia';
import { defineComponent, h } from 'vue';
import { enableAutoUnmount, flushPromises, mount } from '@vue/test-utils';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { PreferencePatch, PreferenceSettings } from '~/api/types/preferences';
import { useThemeStore } from '~/stores/theme';
import { setCurrentLocale } from '~/i18n';
import { SUPPORTED_LOCALES } from '~/i18n/locales';
import OnboardingWindow from './OnboardingWindow.vue';
import OnboardingRecorder from './OnboardingRecorder.vue';
import OnboardingQuickSnip from './OnboardingQuickSnip.vue';
import OnboardingVideo from './OnboardingVideo.vue';
import OnboardingScreenshot from './OnboardingScreenshot.vue';
import OnboardingPreferences from './OnboardingPreferences.vue';
import HUD from '../hud/HUD.vue';
import QuickSnipSelectionBar from '../quick-snip/QuickSnipSelectionBar.vue';
import englishCore from '../../i18n/en/core.json';
import Select from '~/ui/select/Select.vue';
import ThemeModePicker from '../settings/ThemeModePicker.vue';
import DirectoryPreference from '../settings/DirectoryPreference.vue';
import { useOnboarding } from './useOnboarding';

const bridge = vi.hoisted(() => ({
  platform: 'linux',
  getPreferences: vi.fn(),
  updatePreferences: vi.fn(),
  onPreferencesChanged: vi.fn(() => vi.fn()),
  completeOnboarding: vi.fn(),
  closeOnboarding: vi.fn(),
  minimize: vi.fn(),
  getDirectories: vi.fn(),
  chooseDirectory: vi.fn(),
  inputAccessStatus: vi.fn(),
  requestInputAccess: vi.fn(),
  setCameraOverlayActive: vi.fn(),
  discover: vi.fn(),
  onUpdateState: vi.fn(() => vi.fn()),
  getUpdateState: vi.fn().mockResolvedValue(null),
}));
vi.mock('~/api/capture', () => ({ capture: bridge }));
enableAutoUnmount(afterEach);
let settings: PreferenceSettings;
beforeEach(() => {
  vi.clearAllMocks();
  setActivePinia(createPinia());
  bridge.platform = 'linux';
  settings = {
    schemaVersion: 3,
    theme: 'light',
    recordingBar: { visibility: 'always' },
    recordingInteractions: { enabled: false, noticeDismissed: false },
    devices: {},
    shortcuts: {},
    backgroundPresets: { colors: [], gradients: [] },
    extras: { captureMode: 'screenshot' },
  };
  bridge.getPreferences.mockReset().mockImplementation(async () => settings);
  bridge.updatePreferences.mockReset().mockImplementation(async (patch: PreferencePatch) => {
    settings = { ...settings, ...patch, extras: { ...settings.extras, ...patch.extras } } as PreferenceSettings;
    return settings;
  });
  bridge.completeOnboarding.mockReset().mockResolvedValue(true);
  bridge.closeOnboarding.mockReset().mockResolvedValue(true);
  bridge.inputAccessStatus.mockResolvedValue({
    state: 'available',
    canRequest: false,
    clicks: true,
    shortcuts: true,
    recordsText: false,
  });
  bridge.getDirectories.mockResolvedValue({
    projects: { directory: null, recent: [] },
    exports: { directory: null, lastDirectory: null, recent: [] },
    defaultProjectsDirectory: '/videos/Beam',
    defaultExportDirectory: '/videos',
  });
  bridge.chooseDirectory.mockResolvedValue(null);
});
afterEach(async () => {
  await setCurrentLocale('en');
});

function flowFixture() {
  let flow!: ReturnType<typeof useOnboarding>;
  const wrapper = mount(
    defineComponent({
      setup() {
        flow = useOnboarding();
        return () => h('div');
      },
    }),
  );
  return { flow, wrapper };
}

describe('onboarding navigation and completion', () => {
  it('shows the local landscape, readable headline and primary next action immediately', async () => {
    const wrapper = mount(OnboardingWindow);
    expect(wrapper.get('h1').text()).toBe('Your screen.Worth sharing.');
    expect(wrapper.get('.continue').text()).toContain('Discover Beam');
    expect(wrapper.get('.landscape img').attributes('src')).toContain('/onboarding/alpine-dawn.webp');
    expect(wrapper.get('.landscape').attributes('aria-hidden')).toBe('true');
    await flushPromises();
    expect(wrapper.get('.continue').attributes('disabled')).toBeUndefined();
    expect(bridge.discover).not.toHaveBeenCalled();
    expect(bridge.requestInputAccess).not.toHaveBeenCalled();
    expect(bridge.setCameraOverlayActive).not.toHaveBeenCalled();
  });
  it('keeps the restored capture mode, navigates back, and completes only from the last step', async () => {
    const wrapper = mount(OnboardingWindow, { attachTo: document.body });
    await flushPromises();
    await wrapper.get('.continue').trigger('click');
    await flushPromises();
    expect(wrapper.getComponent(OnboardingRecorder).props('modelValue')).toBe('screenshot');
    expect(document.activeElement).toBe(wrapper.get('h1').element);
    expect(wrapper.find('.landscape').exists()).toBe(false);
    expect(wrapper.get('[aria-current="step"]').attributes('aria-label')).toBe('Recorder');
    await wrapper.get('[aria-label="Recorder"][aria-pressed]').trigger('click');
    for (const component of [OnboardingQuickSnip, OnboardingVideo, OnboardingScreenshot, OnboardingPreferences]) {
      await wrapper.get('.continue').trigger('click');
      await flushPromises();
      expect(wrapper.findComponent(component).exists()).toBe(true);
      expect(bridge.completeOnboarding).not.toHaveBeenCalled();
    }
    await wrapper.get('.footer button').trigger('click');
    await flushPromises();
    expect(wrapper.findComponent(OnboardingScreenshot).exists()).toBe(true);
    await wrapper.get('.progress [aria-label="Recorder"]').trigger('click');
    await flushPromises();
    expect(wrapper.getComponent(OnboardingRecorder).props('modelValue')).toBe('studio');
    await wrapper.get('.progress [aria-label="Make Beam yours."]').trigger('click');
    await flushPromises();
    await wrapper.get('.continue').trigger('click');
    await flushPromises();
    expect(bridge.completeOnboarding).toHaveBeenCalledOnce();
    expect(bridge.updatePreferences).toHaveBeenCalledWith(
      expect.objectContaining({ theme: 'light', extras: { captureMode: 'studio', locale: 'en' } }),
    );
  });
  it('adapts its photograph to dark mode and reserves native macOS controls', async () => {
    settings.theme = 'dark';
    bridge.platform = 'darwin';
    const wrapper = mount(OnboardingWindow);
    await flushPromises();
    expect(wrapper.classes()).toContain('dark');
    expect(wrapper.classes()).toContain('mac');
    expect(wrapper.get('.landscape img').attributes('src')).toContain('alpine-night.webp');
    expect(wrapper.find('.window-controls').exists()).toBe(false);
  });
  it('uses owned minimize and close actions without activating capture devices', async () => {
    const wrapper = mount(OnboardingWindow);
    await flushPromises();
    await wrapper.get('[aria-label="Minimize"]').trigger('click');
    expect(bridge.minimize).toHaveBeenCalledOnce();
    await wrapper.get('[aria-label="Close"]').trigger('click');
    await flushPromises();
    expect(bridge.closeOnboarding).toHaveBeenCalledOnce();
    expect(bridge.completeOnboarding).not.toHaveBeenCalled();
    expect(bridge.updatePreferences).not.toHaveBeenCalled();
  });
  it('allows only bounded navigation after preferences finish loading', async () => {
    const { flow } = flowFixture();
    flow.navigate(1);
    expect(flow.step.value).toBe(0);
    await flow.finish();
    expect(bridge.completeOnboarding).not.toHaveBeenCalled();
    await flushPromises();
    expect(flow.mode.value).toBe('screenshot');
    flow.navigate(-1);
    expect(flow.step.value).toBe(0);
    flow.navigate(8);
    expect(flow.step.value).toBe(5);
    flow.navigate(-8);
    expect(flow.step.value).toBe(0);
  });
  it.each(['studio', 'instant', 'unknown', undefined])('restores a valid saved mode: %s', async (mode) => {
    settings.extras.captureMode = mode;
    const { flow } = flowFixture();
    await flushPromises();
    expect(flow.mode.value).toBe(mode === 'instant' ? 'instant' : 'studio');
  });
  it.each([new Error('disk unavailable'), 'not readable'])(
    'shows a preference read error, blocks progression and supports retry: %s',
    async (reason) => {
      bridge.getPreferences.mockRejectedValue(reason);
      const { flow } = flowFixture();
      await flushPromises();
      expect(flow.loadFailed.value).toBe(true);
      expect(flow.loading.value).toBe(false);
      expect(flow.error.value).toBe(reason instanceof Error ? reason.message : 'Could not save your preferences.');
      flow.navigate(1);
      await flow.finish();
      expect(flow.step.value).toBe(0);
      expect(bridge.completeOnboarding).not.toHaveBeenCalled();
      bridge.getPreferences.mockResolvedValue(settings);
      await flow.load();
      expect(flow.loadFailed.value).toBe(false);
      expect(flow.error.value).toBe('');
    },
  );
  it('renders a retry action if preference loading fails', async () => {
    bridge.getPreferences.mockRejectedValue(new Error('read failed'));
    const wrapper = mount(OnboardingWindow);
    await flushPromises();
    expect(wrapper.get('[role="alert"]').text()).toContain('read failed');
    expect(wrapper.get('.continue').attributes('disabled')).toBeDefined();
    bridge.getPreferences.mockResolvedValue(settings);
    await wrapper.get('[role="alert"] button').trigger('click');
    await flushPromises();
    expect(wrapper.find('[role="alert"]').exists()).toBe(false);
  });
  it('keeps state untouched after a delayed hydration completes past unmount', async () => {
    let resolve!: (value: PreferenceSettings) => void;
    bridge.getPreferences.mockReturnValue(
      new Promise<PreferenceSettings>((done) => {
        resolve = done;
      }),
    );
    const { flow, wrapper } = flowFixture();
    wrapper.unmount();
    resolve(settings);
    await flushPromises();
    expect(flow.mode.value).toBe('studio');
    expect(flow.loading.value).toBe(true);
    await flow.load();
    await flow.finish();
    expect(bridge.completeOnboarding).not.toHaveBeenCalled();
  });
  it('ignores a late hydration error after unmount', async () => {
    let reject!: (reason: Error) => void;
    const promise = new Promise<PreferenceSettings>((_resolve, fail) => {
      reject = fail;
    });
    bridge.getPreferences.mockReturnValue(promise);
    const { flow, wrapper } = flowFixture();
    wrapper.unmount();
    reject(new Error('gone'));
    await flushPromises();
    expect(flow.error.value).toBe('');
  });
  it('serializes completion, prevents navigation during saving, then invokes native completion', async () => {
    const { flow } = flowFixture();
    await flushPromises();
    let resolve!: (value: PreferenceSettings) => void;
    bridge.updatePreferences.mockReturnValue(
      new Promise<PreferenceSettings>((done) => {
        resolve = done;
      }),
    );
    const saving = flow.finish();
    expect(flow.busy.value).toBe(true);
    flow.navigate(1);
    expect(flow.step.value).toBe(0);
    await flow.finish();
    await flow.load();
    expect(bridge.updatePreferences).toHaveBeenCalledOnce();
    expect(bridge.completeOnboarding).not.toHaveBeenCalled();
    resolve(settings);
    await saving;
    expect(bridge.completeOnboarding).toHaveBeenCalledOnce();
    expect(flow.busy.value).toBe(false);
  });
  it.each([new Error('write failed'), 'unknown failure'])(
    'keeps a retryable error after save rejection: %s',
    async (reason) => {
      const { flow } = flowFixture();
      await flushPromises();
      bridge.updatePreferences.mockRejectedValueOnce(reason);
      await flow.finish();
      expect(bridge.completeOnboarding).not.toHaveBeenCalled();
      expect(flow.busy.value).toBe(false);
      expect(flow.error.value).toBe(reason instanceof Error ? reason.message : 'Could not save your preferences.');
      await flow.finish();
      expect(bridge.completeOnboarding).toHaveBeenCalledOnce();
      expect(flow.error.value).toBe('');
    },
  );
  it('reports a native completion failure and allows back navigation', async () => {
    const { flow } = flowFixture();
    await flushPromises();
    flow.navigate(2);
    bridge.completeOnboarding.mockRejectedValueOnce(new Error('completion failed'));
    await flow.finish();
    expect(flow.error.value).toBe('completion failed');
    flow.navigate(-1);
    expect(flow.step.value).toBe(1);
    expect(flow.error.value).toBe('');
  });
  it('allows dismissal even while preferences are still loading', async () => {
    bridge.getPreferences.mockReturnValue(new Promise(() => {}));
    const { flow } = flowFixture();
    await flow.finish(true);
    expect(bridge.closeOnboarding).toHaveBeenCalledOnce();
    expect(bridge.completeOnboarding).not.toHaveBeenCalled();
  });
  it('keeps close failures visible', async () => {
    const { flow } = flowFixture();
    await flushPromises();
    bridge.closeOnboarding.mockRejectedValue(new Error('close failed'));
    await flow.finish(true);
    expect(flow.error.value).toBe('close failed');
    expect(flow.busy.value).toBe(false);
  });
  it('ignores completion rejection after the component is gone', async () => {
    const { flow, wrapper } = flowFixture();
    await flushPromises();
    let reject!: (reason: Error) => void;
    bridge.closeOnboarding.mockReturnValue(
      new Promise((_resolve, fail) => {
        reject = fail;
      }),
    );
    const closing = flow.finish(true);
    wrapper.unmount();
    reject(new Error('gone'));
    await closing;
    expect(flow.error.value).toBe('');
  });
});

describe('onboarding shared preferences and choices', () => {
  it('reuses the theme picker and project-directory control and changes language live', async () => {
    const wrapper = mount(OnboardingPreferences, { props: { disabled: false } });
    await flushPromises();
    expect(wrapper.getComponent(DirectoryPreference).props('kind')).toBe('projects');
    wrapper.getComponent(ThemeModePicker).vm.$emit('update:modelValue', 'dark');
    await flushPromises();
    expect(useThemeStore().theme).toBe('dark');
    const select = wrapper.getComponent(Select);
    select.vm.$emit('update:modelValue', 4);
    select.vm.$emit('update:modelValue', 'invalid');
    await flushPromises();
    expect(select.props('modelValue')).toBe('en');
    select.vm.$emit('update:modelValue', 'fr');
    await flushPromises();
    await vi.waitFor(() => expect(wrapper.text()).toContain('Apparence'));
    expect(select.props('modelValue')).toBe('fr');
    await wrapper.setProps({ disabled: true });
    expect(wrapper.get('fieldset').attributes('disabled')).toBeDefined();
    expect(wrapper.getComponent(DirectoryPreference).props('disabled')).toBe(true);
  });
  it('provides the same complete localized onboarding keys in every language', async () => {
    const english = (await import('../../i18n/en/core.json')).default.Onboarding;
    for (const locale of SUPPORTED_LOCALES) {
      const translated = (await import(`../../i18n/${locale}/core.json`)).default.Onboarding;
      expect(Object.keys(translated).sort()).toEqual(Object.keys(english).sort());
      expect(Object.values(translated).every((value) => typeof value === 'string' && value.trim().length > 0)).toBe(
        true,
      );
      expect(translated.step).toContain('{current}');
      expect(translated.step).toContain('{total}');
    }
  });
});

describe('interactive product introductions', () => {
  it('explains real Recorder controls and ignores unrelated focus events', async () => {
    const wrapper = mount(OnboardingRecorder, { props: { modelValue: 'studio' } });
    await flushPromises();
    for (const label of ['Region', 'Window', 'Full screen']) {
      await wrapper.get(`[aria-label="${label}"]`).trigger('click');
      expect(wrapper.get('.feature-description').text().length).toBeGreaterThan(20);
    }
    const hud = wrapper.getComponent(HUD);
    for (const key of ['camera', 'mic', 'systemAudio', 'teleprompter', 'tabs', 'projects', 'topbar']) {
      hud.vm.$emit('focus-feature', key);
      await flushPromises();
      expect(wrapper.get('.feature-description').text().length).toBeGreaterThan(20);
    }
    const previous = wrapper.get('.feature-description').text();
    hud.vm.$emit('focus-feature', 'unknown');
    await flushPromises();
    expect(wrapper.get('.feature-description').text()).toBe(previous);
    hud.vm.$emit('update:capture-mode', 'screenshot');
    await flushPromises();
    expect(wrapper.emitted('update:modelValue')).toEqual([['screenshot']]);
    expect(bridge.discover).not.toHaveBeenCalled();
  });
  it('explores Quick Snip sources, modes and actions through the shared toolbar without native jobs', async () => {
    const wrapper = mount(OnboardingQuickSnip);
    const toolbar = wrapper.getComponent(QuickSnipSelectionBar);
    for (const target of ['screen', 'region', 'window']) {
      toolbar.vm.$emit('select-source', target);
      await flushPromises();
      expect(toolbar.props('state').captureTarget).toBe(target);
    }
    for (const mode of ['screenshot', 'studio']) {
      toolbar.vm.$emit('update:displayMode', mode);
      await flushPromises();
      expect(toolbar.props('state').mode).toBe(mode);
      toolbar.vm.$emit('capture');
      await flushPromises();
      expect(wrapper.get('p').text()).toBe(
        mode === 'screenshot' ? englishCore.Onboarding.quickImage : englishCore.Onboarding.quickVideo,
      );
    }
    for (const kind of ['microphone', 'camera', 'systemAudio']) {
      toolbar.vm.$emit('device-menu', kind, new MouseEvent('click'));
      await flushPromises();
      expect(wrapper.get('p').text().length).toBeGreaterThan(20);
      toolbar.vm.$emit('device-keydown', kind, new KeyboardEvent('keydown', { key: 'Enter' }));
      await flushPromises();
    }
    toolbar.vm.$emit('toggle-settings', new MouseEvent('click'));
    await flushPromises();
    expect(wrapper.get('p').text()).toBe(englishCore.Onboarding.quickSettings);
    toolbar.vm.$emit('cancel');
    await flushPromises();
    expect(wrapper.get('p').text()).toBe(englishCore.Onboarding.quickDescription);
    expect(bridge.discover).not.toHaveBeenCalled();
    expect(bridge.updatePreferences).not.toHaveBeenCalled();
  });
  it('uses the image action explanation when Quick Snip is in image mode', async () => {
    const wrapper = mount(OnboardingQuickSnip);
    const toolbar = wrapper.getComponent(QuickSnipSelectionBar);
    toolbar.vm.$emit('update:displayMode', 'screenshot');
    await flushPromises();
    toolbar.vm.$emit('capture');
    await flushPromises();
    expect(wrapper.get('p').text()).toBe(englishCore.Onboarding.quickImage);
  });
  it('switches the real Studio screenshots and feature explanations', async () => {
    const wrapper = mount(OnboardingVideo);
    for (const button of wrapper.findAll('button')) {
      await button.trigger('click');
      expect(wrapper.get('img').attributes('src')).toContain('/onboarding/video-');
      expect(wrapper.get('img').attributes('alt')).toBe(button.text());
      expect(wrapper.get('p').text().length).toBeGreaterThan(20);
      expect(button.attributes('aria-pressed')).toBe('true');
    }
  });
  it('retains the captured Recorder while changing screenshot backgrounds', async () => {
    const wrapper = mount(OnboardingScreenshot);
    for (const [index, value] of ['gradient', 'photo', 'color'].entries()) {
      await wrapper.findAll('button')[index]!.trigger('click');
      expect(wrapper.get('.capture-example').classes()).toContain(value);
      expect(wrapper.get('img').attributes('src')).toContain('/onboarding/recorder.webp');
    }
    await wrapper.findAll('button')[1]!.trigger('click');
    expect(wrapper.get('.capture-example').attributes('style')).toContain('alpine-dawn.webp');
  });
});
