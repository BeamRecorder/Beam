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
  getUpdateState: vi.fn(() => Promise.resolve({ currentVersion: '1.2.3' })),
  openDiscordInvite: vi.fn(),
  openGithubRepository: vi.fn(),
}));
vi.mock('~/api/capture', () => ({ capture }));

import SettingsPanel from './SettingsPanel.vue';

const Button = {
  inheritAttrs: true,
  props: { loading: { type: Boolean, default: false }, disabled: { type: Boolean, default: false } },
  emits: ['click'],
  template:
    '<button v-bind="$attrs" :disabled="loading || disabled" @click="$emit(\'click\')"><slot name="icon" /><slot /></button>',
};
const ButtonGroup = { template: '<div class="button-group"><slot /></div>' };
const Select = {
  emits: ['update:modelValue'],
  template: '<button class="language-select" @click="$emit(\'update:modelValue\', \'fr\')">Select</button>',
};
const UpdateControls = { template: '<div class="update-controls-stub">Updates</div>' };

describe('SettingsPanel', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    localStorage.clear();
    Object.defineProperty(window, 'matchMedia', {
      configurable: true,
      value: () => ({ matches: false, addEventListener: vi.fn(), removeEventListener: vi.fn() }),
    });
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText: vi.fn().mockResolvedValue(undefined) },
    });
    capture.getPreferences.mockResolvedValue({ theme: 'light' });
    capture.updatePreferences.mockResolvedValue({ theme: 'light' });
    vi.clearAllMocks();
    capture.getPreferences.mockResolvedValue({ theme: 'light' });
    capture.updatePreferences.mockResolvedValue({ theme: 'light' });
    capture.openRecorderFromEditor.mockResolvedValue(true);
    capture.getUpdateState.mockResolvedValue({ currentVersion: '1.2.3' });
  });

  it('renders appearance controls and changes locale through the store', async () => {
    const wrapper = mount(SettingsPanel, {
      global: { stubs: { Button, ButtonGroup, Select, UpdateControls } },
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
    wrapper.get('.appearance-advanced-panel .ui-scale-setting');
    wrapper.get('.appearance-advanced-panel .theme-customization-section');
    expect(wrapper.find('.appearance-advanced-panel .accordion').exists()).toBe(false);
  });

  it('opens language advanced settings and toggles spell check', async () => {
    const wrapper = mount(SettingsPanel, {
      global: { stubs: { Button, ButtonGroup, Select, UpdateControls } },
    });

    const advanced = wrapper.get('.language-setting .advanced-toggle');
    expect(advanced.attributes('aria-expanded')).toBe('false');
    expect(wrapper.find('#language-advanced-panel').exists()).toBe(false);

    await advanced.trigger('click');

    expect(advanced.attributes('aria-expanded')).toBe('true');
    const spellCheck = wrapper.get('#language-advanced-panel [role="switch"]');
    expect(spellCheck.attributes('aria-checked')).toBe('true');

    capture.updatePreferences.mockResolvedValueOnce({ spellCheck: { enabled: false } });
    await spellCheck.trigger('click');

    expect(capture.updatePreferences).toHaveBeenCalledWith({ spellCheck: { enabled: false } });
    expect(spellCheck.attributes('aria-checked')).toBe('false');
  });

  it('renders the update controls section', () => {
    const wrapper = mount(SettingsPanel, {
      global: { stubs: { Button, ButtonGroup, Select, UpdateControls } },
    });
    expect(wrapper.find('.update-controls-stub').exists()).toBe(true);
    expect(wrapper.text()).toContain('Theme Mode');
  });

  it('opens the community links from the socials section', async () => {
    const wrapper = mount(SettingsPanel, {
      global: { stubs: { Button, ButtonGroup, Select, UpdateControls } },
    });
    const socialButtons = wrapper.findAll('.social-links button');

    await socialButtons[0].trigger('click');
    await socialButtons[1].trigger('click');

    expect(capture.openDiscordInvite).toHaveBeenCalledOnce();
    expect(capture.openGithubRepository).toHaveBeenCalledOnce();
    expect(wrapper.find('.discord-icon').attributes('src')).toContain('discord_svg.svg');
    expect(wrapper.find('.github-icon').attributes('src')).toContain('github.svg');
  });

  it('opens the recorder through the editor launcher without embedding another HUD', async () => {
    const wrapper = mount(SettingsPanel, {
      global: { stubs: { Button, ButtonGroup, Select, UpdateControls } },
    });

    const switchBtn = wrapper.get('.dev-switch');
    await switchBtn.trigger('click');

    expect(wrapper.find('.dev-frame').exists()).toBe(true);
    expect(localStorage.getItem('dev_mode_enabled')).toBe('true');

    const launchButton = wrapper.findAll('.dev-action-btn')[0];
    expect(launchButton.text()).toContain('Launch Recorder');
    expect(wrapper.find('.popover-stub').exists()).toBe(false);
    expect(wrapper.find('.hud-stub').exists()).toBe(false);

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
      global: { stubs: { Button, ButtonGroup, Select, UpdateControls } },
    });
    await wrapper.get('.dev-switch').trigger('click');
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

  it('copies system information to clipboard when clicking copy button', async () => {
    const wrapper = mount(SettingsPanel, {
      global: { stubs: { Button, ButtonGroup, Select, UpdateControls } },
    });
    await wrapper.get('.dev-switch').trigger('click');

    const copyBtn = wrapper.findAll('.dev-action-btn')[1];
    await copyBtn.trigger('click');

    expect(navigator.clipboard.writeText).toHaveBeenCalledWith(expect.stringContaining('App Version: 1.2.3'));
  });
});
