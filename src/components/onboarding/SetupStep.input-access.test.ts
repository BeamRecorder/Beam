import { createPinia, setActivePinia } from 'pinia';
import { MotionPlugin } from '@vueuse/motion';
import { flushPromises, mount } from '@vue/test-utils';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { InputAccessStatus } from '~/api/types/capture-api';
import { i18n, setCurrentLocale } from '../../i18n';
import SetupStep from './SetupStep.vue';

const capture = vi.hoisted(() => ({
  platform: 'linux',
  inputAccessStatus: vi.fn(),
  requestInputAccess: vi.fn(),
  updatePreferences: vi.fn().mockResolvedValue({}),
  getPreferences: vi.fn(),
  onPreferencesChanged: vi.fn().mockReturnValue(() => {}),
}));
vi.mock('~/api/capture', () => ({ capture }));

const accessFailure: InputAccessStatus = {
  state: 'unavailable',
  canRequest: true,
  clicks: false,
  shortcuts: false,
  recordsText: false,
  error: {
    code: 'input-helper-start-failed',
    message: 'The protected input helper could not start.',
  },
};

const available: InputAccessStatus = {
  state: 'available',
  canRequest: false,
  clicks: true,
  shortcuts: true,
  recordsText: false,
};

describe('SetupStep input access error', () => {
  beforeEach(async () => {
    setActivePinia(createPinia());
    await setCurrentLocale('en');
    vi.clearAllMocks();
    capture.onPreferencesChanged.mockReturnValue(() => {});
    capture.getPreferences.mockResolvedValue({
      schemaVersion: 3,
      theme: 'dark',
      recordingBar: { visibility: 'always' },
      recordingInteractions: { enabled: false, noticeDismissed: false },
      devices: {},
      shortcuts: {},
      backgroundPresets: { colors: [], gradients: [] },
      extras: {},
    });
    capture.inputAccessStatus.mockResolvedValue(accessFailure);
    capture.requestInputAccess.mockResolvedValue(available);
  });

  afterEach(async () => {
    await setCurrentLocale('en');
  });

  it('shows a retryable native error and clears it after access is authorized', async () => {
    const wrapper = mount(SetupStep, {
      global: { plugins: [i18n, MotionPlugin] },
    });

    await flushPromises();

    expect(wrapper.get('.interaction-access-error[role="alert"]').text()).toBe(accessFailure.error?.message);
    const authorize = wrapper.get('.not-auth-group button');
    expect(authorize.attributes('disabled')).toBeUndefined();

    await authorize.trigger('click');
    await flushPromises();

    expect(capture.requestInputAccess).toHaveBeenCalledOnce();
    expect(wrapper.find('.interaction-access-error[role="alert"]').exists()).toBe(false);
    expect(wrapper.find('.not-auth-group button').exists()).toBe(false);
    wrapper.unmount();
  });

  it.each([new Error('Authorization failed'), 'unknown error'])(
    'keeps retry available after rejection: %s',
    async (error) => {
      capture.requestInputAccess.mockRejectedValue(error);
      const wrapper = mount(SetupStep, { global: { plugins: [i18n, MotionPlugin] } });
      await flushPromises();
      await wrapper.get('.not-auth-group button').trigger('click');
      await flushPromises();
      expect(wrapper.get('.not-auth-group button').attributes('disabled')).toBeUndefined();
      expect(wrapper.get('.interaction-access-error[role="alert"]').text()).toContain(
        error instanceof Error ? error.message : 'Could not request interaction access.',
      );
      wrapper.unmount();
    },
  );

  it('disables the authorization button while native permission is pending', async () => {
    let complete!: (status: InputAccessStatus) => void;
    capture.requestInputAccess.mockReturnValue(
      new Promise((resolve) => {
        complete = resolve;
      }),
    );
    const wrapper = mount(SetupStep, { global: { plugins: [i18n, MotionPlugin] } });
    await flushPromises();
    await wrapper.get('.not-auth-group button').trigger('click');
    expect(wrapper.get('.not-auth-group button').attributes('disabled')).toBeDefined();
    expect(wrapper.find('.spin-icon').exists()).toBe(true);
    complete(available);
    await flushPromises();
    expect(wrapper.find('.not-auth-group button').exists()).toBe(false);
    wrapper.unmount();
  });

  it('keeps the theme selection usable if the read-only permission check fails', async () => {
    capture.inputAccessStatus.mockRejectedValue(new Error('helper unavailable'));
    const wrapper = mount(SetupStep, { global: { plugins: [i18n, MotionPlugin] } });
    await flushPromises();
    const buttons = wrapper.findAll('.theme-chip');
    for (const [index, button] of buttons.entries()) {
      await button.trigger('click');
      expect(button.attributes('aria-pressed')).toBe('true');
      expect(wrapper.get('.theme-chips-group').attributes('style')).toContain(`--button-group-index: ${index}`);
    }
    wrapper.unmount();
  });
});
