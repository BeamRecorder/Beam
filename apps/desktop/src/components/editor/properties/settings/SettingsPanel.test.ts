import { createPinia, setActivePinia } from 'pinia';
import { flushPromises, mount } from '@vue/test-utils';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const capture = vi.hoisted(() => ({
  getPreferences: vi.fn(),
  updatePreferences: vi.fn(),
  onPreferencesChanged: vi.fn(() => () => undefined),
  setWindowMode: vi.fn(),
  showHud: vi.fn(),
  openRecorderFromEditor: vi.fn(),
  toggleDevTools: vi.fn(),
  getUpdateState: vi.fn(() => Promise.resolve({ currentVersion: '1.2.3' })),
  openDiscordInvite: vi.fn(),
  openGithubRepository: vi.fn(),
}));
vi.mock('~/api/capture', () => ({ capture }));

import SettingsPanel from './SettingsPanel.vue';
import { setCurrentLocale } from '~/i18n';

const Button = {
  inheritAttrs: true,
  props: {
    loading: { type: Boolean, default: false },
    disabled: { type: Boolean, default: false },
  },
  emits: ['click'],
  template:
    '<button v-bind="$attrs" :disabled="loading || disabled" @click="$emit(\'click\')"><slot name="icon" /><slot /></button>',
};
const ButtonGroup = { template: '<div class="button-group"><slot /></div>' };
const Select = {
  emits: ['update:modelValue'],
  template: '<button class="language-select" @click="$emit(\'update:modelValue\', \'fr\')">Select</button>',
};
const UpdateControls = {
  template: '<div class="update-controls-stub">Updates</div>',
};

describe('SettingsPanel', () => {
  beforeEach(async () => {
    setActivePinia(createPinia());
    localStorage.clear();
    Object.defineProperty(window, 'matchMedia', {
      configurable: true,
      value: () => ({
        matches: false,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
      }),
    });
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText: vi.fn().mockResolvedValue(undefined) },
    });
    capture.getPreferences.mockResolvedValue({ theme: 'light', extras: {} });
    capture.updatePreferences.mockResolvedValue({ theme: 'light', extras: {} });
    vi.clearAllMocks();
    capture.getPreferences.mockResolvedValue({ theme: 'light', extras: {} });
    capture.updatePreferences.mockResolvedValue({ theme: 'light', extras: {} });
    capture.openRecorderFromEditor.mockResolvedValue(true);
    capture.getUpdateState.mockResolvedValue({ currentVersion: '1.2.3' });
    await setCurrentLocale('en');
  });

  it('keeps recording controls out of screenshot settings even in developer mode', async () => {
    localStorage.setItem('dev_mode_enabled', 'true');
    const wrapper = mount(SettingsPanel, {
      props: { hideRecorder: true },
      global: {
        stubs: { Button, ButtonGroup, Select, UpdateControls, StoragePreferences: true, EditorFakeWebcamAction: true },
      },
    });
    expect(wrapper.find('.appearance-settings').exists()).toBe(true);
    expect(wrapper.findAll('.dev-option-card')).toHaveLength(1);
    await wrapper.setProps({ hideRecorder: false });
    expect(wrapper.findAll('.dev-option-card')).toHaveLength(2);
    wrapper.unmount();
  });

  it('renders appearance controls and changes locale through the store', async () => {
    const wrapper = mount(SettingsPanel, {
      global: {
        stubs: { Button, ButtonGroup, Select, UpdateControls, StoragePreferences: true, EditorFakeWebcamAction: true },
      },
    });
    expect(wrapper.find('.appearance-settings').exists()).toBe(true);
    const languageSetting = wrapper.get('.language-setting');
    const themeModeSetting = wrapper.get('.theme-mode-setting');
    expect(
      languageSetting.element.compareDocumentPosition(themeModeSetting.element) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    expect(wrapper.findAll('.theme-mode-group button').map((button) => button.text())).toEqual([
      'Light',
      'Dark',
      'System',
    ]);
    const advanced = wrapper.get('.appearance-setting .advanced-toggle');
    expect(advanced.attributes('aria-expanded')).toBe('false');
    expect(wrapper.find('.appearance-advanced-panel').exists()).toBe(false);
    await advanced.trigger('click');
    await wrapper.get('.language-setting .language-select').trigger('click');
    await vi.waitFor(() =>
      expect(capture.updatePreferences).toHaveBeenCalledWith({
        extras: { locale: 'fr' },
      }),
    );
    expect(wrapper.find('.appearance-advanced-panel .ui-scale-setting').exists()).toBe(false);
    wrapper.get('.scaling-panel.ui-scale-setting');
    expect(wrapper.find('.scale-overrides').exists()).toBe(false);
    wrapper.get('.appearance-advanced-panel .theme-customization-section');
    expect(wrapper.find('.appearance-advanced-panel .accordion').exists()).toBe(false);
  });

  it('groups writing assistance in Accessibility and toggles spell check', async () => {
    const wrapper = mount(SettingsPanel, {
      global: {
        stubs: { Button, ButtonGroup, Select, UpdateControls, StoragePreferences: true, EditorFakeWebcamAction: true },
      },
    });

    const spellCheck = wrapper.get('.accessibility-setting .spell-check-preference [role="switch"]');
    expect(spellCheck.attributes('aria-checked')).toBe('true');

    capture.updatePreferences.mockResolvedValueOnce({
      spellCheck: { enabled: false },
    });
    await spellCheck.trigger('click');

    expect(capture.updatePreferences).toHaveBeenCalledWith({
      spellCheck: { enabled: false },
    });
    expect(spellCheck.attributes('aria-checked')).toBe('false');
  });

  it('renders the update controls section', () => {
    const wrapper = mount(SettingsPanel, {
      global: {
        stubs: { Button, ButtonGroup, Select, UpdateControls, StoragePreferences: true, EditorFakeWebcamAction: true },
      },
    });
    expect(wrapper.find('.update-controls-stub').exists()).toBe(true);
    expect(wrapper.findAll('.category-heading').map((section) => section.text())).toEqual([
      'General',
      'Appearance',
      'Accessibility',
      'Updates',
      'About',
      'Developer',
    ]);
  });

  it('opens the community links from the socials section', async () => {
    const wrapper = mount(SettingsPanel, {
      global: {
        stubs: { Button, ButtonGroup, Select, UpdateControls, StoragePreferences: true, EditorFakeWebcamAction: true },
      },
    });
    const socialButtons = wrapper.findAll('.social-links button');

    await socialButtons[0].trigger('click');
    await socialButtons[1].trigger('click');

    expect(capture.openDiscordInvite).toHaveBeenCalledOnce();
    expect(capture.openGithubRepository).toHaveBeenCalledOnce();
    expect(wrapper.find('.discord-icon').attributes('src')).toContain('discord_svg.svg');
    expect(wrapper.find('.github-icon').attributes('src')).toContain('github.svg');
  });

  it('opens the recorder through the editor launcher', async () => {
    const wrapper = mount(SettingsPanel, {
      global: {
        stubs: { Button, ButtonGroup, Select, UpdateControls, StoragePreferences: true, EditorFakeWebcamAction: true },
      },
    });

    const switchBtn = wrapper.get('.dev-switch [role="switch"]');
    await switchBtn.trigger('click');

    expect(wrapper.find('.dev-frame').exists()).toBe(true);
    expect(localStorage.getItem('dev_mode_enabled')).toBe('true');

    const launchButton = wrapper.findAll('.dev-action-btn')[0];
    expect(launchButton.text()).toContain('Launch Recorder');

    await launchButton.trigger('click');

    expect(capture.openRecorderFromEditor).toHaveBeenCalledOnce();
    expect(launchButton.attributes('disabled')).toBeUndefined();
  });

  it('shows a loading state and an actionable error when the recorder cannot open', async () => {
    let resolveOpen!: (opened: boolean) => void;
    capture.openRecorderFromEditor.mockReturnValueOnce(
      new Promise<boolean>((resolve) => {
        resolveOpen = resolve;
      }),
    );
    const wrapper = mount(SettingsPanel, {
      global: {
        stubs: { Button, ButtonGroup, Select, UpdateControls, StoragePreferences: true, EditorFakeWebcamAction: true },
      },
    });
    await wrapper.get('.dev-switch [role="switch"]').trigger('click');
    const launchButton = wrapper.findAll('.dev-action-btn')[0];

    await launchButton.trigger('click');
    expect(capture.openRecorderFromEditor).toHaveBeenCalledOnce();
    expect(launchButton.attributes('disabled')).toBeDefined();

    resolveOpen(true);
    await flushPromises();
    expect(launchButton.attributes('disabled')).toBeUndefined();

    capture.openRecorderFromEditor.mockRejectedValueOnce(new Error('recorder unavailable'));
    await launchButton.trigger('click');
    await flushPromises();

    expect(wrapper.get('[role="alert"]').text()).toContain('recorder unavailable');
    expect(launchButton.attributes('disabled')).toBeUndefined();
  });

  it('opens DevTools from developer settings', async () => {
    localStorage.setItem('dev_mode_enabled', 'true');
    const wrapper = mount(SettingsPanel, {
      global: {
        stubs: { Button, ButtonGroup, Select, UpdateControls, StoragePreferences: true, EditorFakeWebcamAction: true },
      },
    });
    await wrapper.findAll('.dev-action-btn')[1]!.trigger('click');
    expect(capture.toggleDevTools).toHaveBeenCalledOnce();
  });

  it.each([false, 'denied'])('reports unsuccessful recorder launches: %s', async (result) => {
    localStorage.setItem('dev_mode_enabled', 'true');
    if (result === false) capture.openRecorderFromEditor.mockResolvedValueOnce(false);
    else capture.openRecorderFromEditor.mockRejectedValueOnce(result);
    const wrapper = mount(SettingsPanel, {
      global: {
        stubs: { Button, ButtonGroup, Select, UpdateControls, StoragePreferences: true, EditorFakeWebcamAction: true },
      },
    });
    const button = wrapper.findAll('.dev-action-btn')[0]!;
    (button.element as HTMLButtonElement).click();
    (button.element as HTMLButtonElement).click();
    await flushPromises();
    expect(capture.openRecorderFromEditor).toHaveBeenCalledOnce();
    expect(wrapper.get('[role="alert"]').text()).toContain(
      result === false ? 'The recorder is already in use.' : result,
    );
  });

  it('copies system information to clipboard when clicking copy button', async () => {
    const wrapper = mount(SettingsPanel, {
      global: {
        stubs: { Button, ButtonGroup, Select, UpdateControls, StoragePreferences: true, EditorFakeWebcamAction: true },
      },
    });
    const copyBtn = wrapper.get('.about-setting .system-info-button');
    await copyBtn.trigger('click');

    expect(navigator.clipboard.writeText).toHaveBeenCalledWith(expect.stringContaining('App Version: 1.2.3'));
  });
});
