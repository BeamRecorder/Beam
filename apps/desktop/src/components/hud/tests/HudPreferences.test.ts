import { createPinia, setActivePinia } from 'pinia';
import { flushPromises, mount } from '@vue/test-utils';
import { defineComponent, h } from 'vue';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import HudPreferences from '../settings/HudPreferences.vue';
import AppearanceSettings from '~/components/settings/AppearanceSettings.vue';
import { captureMock as capture } from './capture.mock';

vi.mock('../../../api/capture', async () => ({
  capture: (await import('./capture.mock')).captureMock,
}));

const Select = defineComponent({
  props: { options: { type: Array, default: () => [] } },
  emits: ['update:modelValue'],
  setup(props, { emit }) {
    return () => {
      const recordingBar = props.options.some(
        (option) => option && typeof option === 'object' && 'value' in option && option.value === 'hover-only',
      );
      return h('button', {
        class: recordingBar ? 'recording-bar-option' : 'countdown',
        onClick: () => emit('update:modelValue', recordingBar ? 'hover-only' : 10),
      });
    };
  },
});

const availableAccess = {
  state: 'available' as const,
  canRequest: false,
  clicks: true,
  shortcuts: true,
  recordsText: false as const,
};
const permissionRequiredAccess = {
  state: 'permission-required' as const,
  canRequest: true,
  clicks: false,
  shortcuts: false,
  recordsText: false as const,
};
const deniedAccess = {
  state: 'denied' as const,
  canRequest: true,
  clicks: false,
  shortcuts: false,
  recordsText: false as const,
};

const mountPreferences = (props: Record<string, unknown> = {}) =>
  mount(HudPreferences, {
    props: {
      view: 'accessibility',
      countdownSeconds: 3,
      inputAccess: availableAccess,
      recordInteractions: false,
      ...props,
    },
    global: { stubs: { Select } },
  });

describe('HudPreferences', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setActivePinia(createPinia());
    capture.getPreferences.mockResolvedValue({
      schemaVersion: 3,
      theme: 'light',
      recordingBar: { visibility: 'always' },
      recordingInteractions: { enabled: false, noticeDismissed: false },
      alwaysOnTop: true,
      devices: {},
      shortcuts: {},
      backgroundPresets: { colors: [], gradients: [] },
      extras: {},
    });
    capture.updatePreferences.mockResolvedValue({});
    capture.onPreferencesChanged.mockReturnValue(() => undefined);
    window.matchMedia ??= () =>
      ({
        matches: false,
        addEventListener: () => undefined,
      }) as unknown as MediaQueryList;
  });
  it('renders the developer actions as a dedicated category', () => {
    const wrapper = mountPreferences({ view: 'developer' });
    expect(wrapper.get('h1').text()).toBe('Developer');
    expect(wrapper.get('[data-setting="devtools"] button').text()).toContain('DevTools');
    expect(wrapper.get('[data-setting="mascot-lab"] button').text()).toContain('Mascot Lab');
    expect(wrapper.find('.appearance-settings').exists()).toBe(false);
    wrapper.unmount();
  });
  it('relays recording preferences', async () => {
    const wrapper = mountPreferences({ view: 'recording' });
    await wrapper.get('.recording-bar-option').trigger('click');
    await wrapper.find('.countdown').trigger('click');
    await wrapper.setProps({ view: 'accessibility' });
    await wrapper.get('.input-access-actions [role="switch"]').trigger('click');
    expect(wrapper.emitted('update:countdownSeconds')).toContainEqual([10]);
    expect(wrapper.emitted('update:recordingBarVisibility')).toContainEqual(['hover-only']);
    expect(wrapper.emitted('update:recordInteractions')).toContainEqual([true]);
  });

  it('renders the shared appearance controls', () => {
    const wrapper = mountPreferences({ view: 'general', countdownSeconds: 0 });
    expect(wrapper.find('.appearance-settings').exists()).toBe(true);
    expect(wrapper.find('.theme-mode-group').exists()).toBe(true);
  });

  it('passes the HUD-specific scaling flag and does not render scaling controls', async () => {
    const wrapper = mountPreferences({ view: 'general' });
    const appearance = wrapper.findComponent(AppearanceSettings);

    expect(appearance.exists()).toBe(true);
    expect(appearance.props('showUiScaling')).toBe(false);

    await appearance.get('.advanced-toggle').trigger('click');

    expect(appearance.find('.ui-scale-setting').exists()).toBe(false);
    expect(appearance.find('.ui-scale-slider').exists()).toBe(false);
  });

  it('exposes spell check directly under Accessibility', async () => {
    const wrapper = mountPreferences();
    const spellCheck = wrapper.get('[data-setting="spell-check"] [role="switch"]');
    expect(spellCheck.attributes('aria-checked')).toBe('true');
    capture.updatePreferences.mockResolvedValueOnce({
      spellCheck: { enabled: false },
    });
    await spellCheck.trigger('click');
    expect(capture.updatePreferences).toHaveBeenCalledWith({
      spellCheck: { enabled: false },
    });
    expect(spellCheck.attributes('aria-checked')).toBe('false');
    wrapper.unmount();
  });

  it('shows the interaction switch only when input access is available', async () => {
    const wrapper = mountPreferences({ recordInteractions: true });

    expect(wrapper.get('.input-access-item .preference-description').text()).toContain(
      'Records safe keyboard shortcuts.',
    );
    expect(wrapper.get('.input-access-item .preference-title').text()).toContain('Record keyboard shortcuts');
    expect(wrapper.get('.input-access-actions [role="switch"]').attributes('aria-checked')).toBe('true');
    expect(wrapper.find('.input-access-actions .btn-secondary').exists()).toBe(false);

    await wrapper.get('.input-access-actions [role="switch"]').trigger('click');
    expect(wrapper.emitted('update:recordInteractions')).toContainEqual([false]);
  });

  it.each(['darwin', 'win32'] as const)(
    'uses generic keyboard-shortcut labels on %s without Linux or mouse metadata',
    (platform) => {
      const wrapper = mountPreferences({ platform });
      const title = wrapper.get('.input-access-item .preference-title').text();
      const description = wrapper.get('.input-access-item .preference-description').text();

      expect(title).toContain('Record keyboard shortcuts');
      expect(title).not.toContain('Linux');
      expect(title).not.toContain('mouse');
      expect(description).toContain('Records safe keyboard shortcuts.');
      expect(description).not.toContain('Linux');
      expect(description).not.toContain('mouse');
    },
  );

  it('uses the Linux keyboard-and-mouse title and explains its recorded events', () => {
    const wrapper = mountPreferences({ platform: 'linux' });
    const title = wrapper.get('.input-access-item .preference-title').text();
    const description = wrapper.get('.input-access-item .preference-description').text();

    expect(title).toContain('Record keyboard & mouse events on Linux');
    expect(description).toContain('On Linux');
    expect(description).toContain('mouse clicks');
    expect(description).toContain('captions');
    expect(description).toContain('automatic zooms');
    expect(description).not.toContain('Typed text is stored');
  });

  it('emits an access request and exposes a busy state while it is pending', async () => {
    const wrapper = mountPreferences({ inputAccess: permissionRequiredAccess });
    const enable = wrapper.get('.input-access-actions .btn-secondary');

    expect(enable.text()).toContain('Enable');
    await enable.trigger('click');
    expect(wrapper.emitted('requestInputAccess')).toHaveLength(1);

    await wrapper.setProps({ requestingInputAccess: true });
    expect(enable.attributes('disabled')).toBeDefined();
    expect(enable.find('.icon-spin').exists()).toBe(true);
    expect(wrapper.find('.input-access-actions [role="switch"]').exists()).toBe(false);
  });

  it('renders the switch after the parent reports successful authorization', async () => {
    const wrapper = mountPreferences({ inputAccess: permissionRequiredAccess });
    await wrapper.get('.input-access-actions .btn-secondary').trigger('click');

    await wrapper.setProps({
      inputAccess: availableAccess,
      recordInteractions: true,
      requestingInputAccess: false,
    });
    expect(wrapper.get('.input-access-actions [role="switch"]').attributes('aria-checked')).toBe('true');
    expect(wrapper.find('.input-access-actions .btn-secondary').exists()).toBe(false);
  });

  it('keeps denied access retryable and does not request permission on mount', async () => {
    const wrapper = mountPreferences({ inputAccess: deniedAccess });

    expect(wrapper.emitted('requestInputAccess')).toBeUndefined();
    const enable = wrapper.get('.input-access-actions .btn-secondary');
    expect(enable.text()).toContain('Enable');
    await enable.trigger('click');
    await enable.trigger('click');
    expect(wrapper.emitted('requestInputAccess')).toHaveLength(2);
  });

  it('shows explicit checking and unavailable states without a toggle', () => {
    const checking = mountPreferences({
      inputAccess: {
        state: 'checking',
        canRequest: false,
        clicks: false,
        shortcuts: false,
        recordsText: false,
      },
    });
    expect(checking.get('.input-access-actions').text()).toContain('Checking');
    expect(checking.find('.input-access-actions [role="switch"]').exists()).toBe(false);
    expect(checking.find('.input-access-actions button').exists()).toBe(false);

    const unavailable = mountPreferences({
      inputAccess: {
        state: 'unavailable',
        canRequest: false,
        clicks: false,
        shortcuts: false,
        recordsText: false,
      },
    });
    expect(unavailable.get('.input-access-actions').text()).toContain('Unavailable');
    expect(unavailable.find('.input-access-actions [role="switch"]').exists()).toBe(false);
    expect(unavailable.find('.input-access-actions button').exists()).toBe(false);
  });

  it('keeps each category focused and reverses motion when moving up the sidebar', async () => {
    const wrapper = mountPreferences({ view: 'general' });
    expect(wrapper.find('[data-setting="countdown"]').exists()).toBe(false);
    expect(wrapper.find('[data-setting="spell-check"]').exists()).toBe(false);
    await wrapper.setProps({ view: 'recording' });
    expect(wrapper.getComponent({ name: 'Transition' }).props('name')).toBe('settings-next');
    expect(wrapper.find('[data-setting="language"]').exists()).toBe(false);
    await wrapper.setProps({ view: 'general' });
    expect(wrapper.getComponent({ name: 'Transition' }).props('name')).toBe('settings-previous');
    wrapper.unmount();
  });

  it('reveals and focuses advanced appearance settings from a search result', async () => {
    Object.defineProperty(HTMLElement.prototype, 'scrollIntoView', {
      configurable: true,
      value: vi.fn(),
    });
    const wrapper = mountPreferences({
      view: 'general',
      focusedSetting: 'secondary-color',
    });
    await flushPromises();
    expect(wrapper.get('.advanced-toggle').attributes('aria-expanded')).toBe('true');
    expect(wrapper.get('[data-setting="secondary-color"]').element.scrollIntoView).toHaveBeenCalled();
    expect(wrapper.find('.divider').exists()).toBe(false);
    await wrapper.setProps({ focusedSetting: 'missing-setting' });
    await flushPromises();
    wrapper.unmount();
  });

  it('exposes and relays Recorder setup always-on-top preferences', async () => {
    const wrapper = mountPreferences({ view: 'recording', alwaysOnTop: false });
    const control = wrapper.get('[data-setting="always-on-top"] [role="switch"]');
    expect(control.attributes('aria-checked')).toBe('false');
    await control.trigger('click');
    expect(wrapper.emitted('update:alwaysOnTop')).toEqual([[true]]);
    await wrapper.setProps({ alwaysOnTop: true });
    await control.trigger('click');
    expect(wrapper.emitted('update:alwaysOnTop')).toContainEqual([false]);
    wrapper.unmount();
  });
});
