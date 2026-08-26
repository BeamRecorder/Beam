import { createPinia, setActivePinia } from 'pinia';
import { mount } from '@vue/test-utils';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const capture = vi.hoisted(() => ({
  getPreferences: vi.fn(),
  updatePreferences: vi.fn(),
  onPreferencesChanged: vi.fn(() => () => undefined),
  setWindowMode: vi.fn(),
  showHud: vi.fn(),
  getUpdateState: vi.fn(() => Promise.resolve({ currentVersion: '1.2.3' })),
  openDiscordInvite: vi.fn(),
  openGithubRepository: vi.fn(),
}));
vi.mock('~/api/capture', () => ({ capture }));

import SettingsPanel from './SettingsPanel.vue';

const Button = {
  inheritAttrs: true,
  emits: ['click'],
  template: '<button v-bind="$attrs" @click="$emit(\'click\')"><slot name="icon" /><slot /></button>',
};
const ButtonGroup = { template: '<div class="button-group"><slot /></div>' };
const Select = {
  emits: ['update:modelValue'],
  template: '<button class="language-select" @click="$emit(\'update:modelValue\', \'fr\')">Select</button>',
};
const UpdateControls = { template: '<div class="update-controls-stub">Updates</div>' };

const Popover = {
  template: '<div class="popover-stub"><slot name="trigger" /><slot :close="() => {}" /></div>',
};
const HUD = {
  name: 'HUD',
  props: {
    embedded: Boolean,
    discoverCaptureSources: Boolean,
  },
  emits: ['start-recording'],
  template:
    "<div class=\"hud-stub\"><span class=\"hud-embedded-value\">{{ embedded ? 'true' : 'false' }}</span><span class=\"hud-discovery-value\">{{ discoverCaptureSources ? 'true' : 'false' }}</span><button class=\"hud-start-btn\" @click=\"$emit('start-recording', { recordingBarVisibility: 'always' })\">Start</button></div>",
};

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
    capture.getUpdateState.mockResolvedValue({ currentVersion: '1.2.3' });
  });

  it('renders appearance controls and changes locale through the store', async () => {
    const wrapper = mount(SettingsPanel, {
      global: { stubs: { Button, ButtonGroup, Select, UpdateControls, Popover, HUD } },
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
      global: { stubs: { Button, ButtonGroup, Select, UpdateControls, Popover, HUD } },
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
      global: { stubs: { Button, ButtonGroup, Select, UpdateControls, Popover, HUD } },
    });
    expect(wrapper.find('.update-controls-stub').exists()).toBe(true);
    expect(wrapper.text()).toContain('Theme Mode');
  });

  it('opens the community links from the socials section', async () => {
    const wrapper = mount(SettingsPanel, {
      global: { stubs: { Button, ButtonGroup, Select, UpdateControls, Popover, HUD } },
    });
    const socialButtons = wrapper.findAll('.social-links button');

    await socialButtons[0].trigger('click');
    await socialButtons[1].trigger('click');

    expect(capture.openDiscordInvite).toHaveBeenCalledOnce();
    expect(capture.openGithubRepository).toHaveBeenCalledOnce();
    expect(wrapper.find('.discord-icon').attributes('src')).toContain('discord_svg.svg');
    expect(wrapper.find('.github-icon').attributes('src')).toContain('github.svg');
  });

  it('toggles dev mode and reveals the framed recorder options', async () => {
    const wrapper = mount(SettingsPanel, {
      global: { stubs: { Button, ButtonGroup, Select, UpdateControls, Popover, HUD } },
    });
    expect(wrapper.find('.dev-frame').exists()).toBe(false);

    const switchBtn = wrapper.get('.dev-switch');
    await switchBtn.trigger('click');

    expect(wrapper.find('.dev-frame').exists()).toBe(true);
    expect(localStorage.getItem('dev_mode_enabled')).toBe('true');

    const startBtn = wrapper.get('.hud-start-btn');
    await startBtn.trigger('click');

    expect(wrapper.emitted('start-recording')).toBeTruthy();
  });

  it('enables source discovery in the embedded recorder', async () => {
    const wrapper = mount(SettingsPanel, {
      global: { stubs: { Button, ButtonGroup, Select, UpdateControls, Popover, HUD } },
    });
    await wrapper.get('.dev-switch').trigger('click');

    const recorder = wrapper.findComponent(HUD);
    expect(recorder.props()).toMatchObject({ embedded: true, discoverCaptureSources: true });
  });

  it('copies system information to clipboard when clicking copy button', async () => {
    const wrapper = mount(SettingsPanel, {
      global: { stubs: { Button, ButtonGroup, Select, UpdateControls, Popover, HUD } },
    });
    await wrapper.get('.dev-switch').trigger('click');

    const copyBtn = wrapper.findAll('.dev-action-btn')[1];
    await copyBtn.trigger('click');

    expect(navigator.clipboard.writeText).toHaveBeenCalledWith(expect.stringContaining('App Version: 1.2.3'));
  });
});
