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
  beforeEach(() => {
    setActivePinia(createPinia());
    setCurrentLocale('en');
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

  afterEach(() => {
    setCurrentLocale('en');
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
});
