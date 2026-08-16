import { createPinia, setActivePinia } from 'pinia';
import { mount } from '@vue/test-utils';
import { defineComponent, h } from 'vue';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import HudPreferences from '../settings/HudPreferences.vue';
import { captureMock as capture } from './capture.mock';

vi.mock('../../../api/capture', async () => ({ capture: (await import('./capture.mock')).captureMock }));

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
    props: { countdownSeconds: 3, inputAccess: availableAccess, recordInteractions: false, ...props },
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
    window.matchMedia ??= () => ({ matches: false, addEventListener: () => undefined }) as unknown as MediaQueryList;
  });
  it('relays recording preferences', async () => {
    const wrapper = mountPreferences();
    await wrapper.get('.recording-bar-option').trigger('click');
    await wrapper.find('.countdown').trigger('click');
    await wrapper.get('.input-access-actions [role="switch"]').trigger('click');
    expect(wrapper.emitted('update:countdownSeconds')).toContainEqual([10]);
    expect(wrapper.emitted('update:recordingBarVisibility')).toContainEqual(['hover-only']);
    expect(wrapper.emitted('update:recordInteractions')).toContainEqual([true]);
  });

  it('renders the shared appearance controls', () => {
    const wrapper = mountPreferences({ countdownSeconds: 0 });
    expect(wrapper.find('.appearance-settings').exists()).toBe(true);
    expect(wrapper.find('.theme-mode-select').exists()).toBe(true);
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
    'uses the generic keyboard-shortcut description on %s without Linux click metadata',
    (platform) => {
      const wrapper = mountPreferences({ platform });
      const description = wrapper.get('.input-access-item .preference-description').text();

      expect(description).toContain('Records safe keyboard shortcuts.');
      expect(description).not.toContain('Linux');
      expect(description).not.toContain('click');
    },
  );

  it('mentions Linux click metadata in the platform-specific description', () => {
    const wrapper = mountPreferences({ platform: 'linux' });
    const description = wrapper.get('.input-access-item .preference-description').text();

    expect(description).toContain('Records safe keyboard shortcuts.');
    expect(description).toContain('mouse click metadata');
  });

  it('emits an access request and exposes a busy state while it is pending', async () => {
    const wrapper = mountPreferences({ inputAccess: permissionRequiredAccess });
    const authorize = wrapper.get('.input-access-actions .btn-secondary');

    await authorize.trigger('click');
    expect(wrapper.emitted('requestInputAccess')).toHaveLength(1);

    await wrapper.setProps({ requestingInputAccess: true });
    expect(authorize.attributes('disabled')).toBeDefined();
    expect(authorize.text()).toContain('Authorizing');
    expect(wrapper.find('.input-access-actions [role="switch"]').exists()).toBe(false);
  });

  it('renders the switch after the parent reports successful authorization', async () => {
    const wrapper = mountPreferences({ inputAccess: permissionRequiredAccess });
    await wrapper.get('.input-access-actions .btn-secondary').trigger('click');

    await wrapper.setProps({ inputAccess: availableAccess, recordInteractions: true, requestingInputAccess: false });
    expect(wrapper.get('.input-access-actions [role="switch"]').attributes('aria-checked')).toBe('true');
    expect(wrapper.find('.input-access-actions .btn-secondary').exists()).toBe(false);
  });

  it('keeps denied access retryable and does not request permission on mount', async () => {
    const wrapper = mountPreferences({ inputAccess: deniedAccess });

    expect(wrapper.emitted('requestInputAccess')).toBeUndefined();
    const authorize = wrapper.get('.input-access-actions .btn-secondary');
    await authorize.trigger('click');
    await authorize.trigger('click');
    expect(wrapper.emitted('requestInputAccess')).toHaveLength(2);
  });

  it('shows explicit checking and unavailable states without a toggle', () => {
    const checking = mountPreferences({
      inputAccess: { state: 'checking', canRequest: false, clicks: false, shortcuts: false, recordsText: false },
    });
    expect(checking.get('.input-access-actions').text()).toContain('Checking');
    expect(checking.find('.input-access-actions [role="switch"]').exists()).toBe(false);

    const unavailable = mountPreferences({
      inputAccess: { state: 'unavailable', canRequest: false, clicks: false, shortcuts: false, recordsText: false },
    });
    expect(unavailable.get('.input-access-actions').text()).toContain('Unavailable');
    expect(unavailable.find('.input-access-actions [role="switch"]').exists()).toBe(false);
  });

  it('relays alwaysOnTop toggle events', async () => {
    const wrapper = mount(HudPreferences, {
      props: { countdownSeconds: 3, alwaysOnTop: true },
      global: { stubs: { Select } },
    });
    const switchEl = wrapper.find('.switch-container');
    await switchEl.trigger('click');
    expect(wrapper.emitted('update:alwaysOnTop')).toContainEqual([false]);
  });
});
