import { mount } from '@vue/test-utils';
import { describe, expect, it } from 'vitest';
import type { InputAccessStatus } from '~/api/types/capture-api';
import InteractionAccessError from './InteractionAccessError.vue';

const checking = {
  state: 'checking',
  canRequest: false,
  clicks: false,
  shortcuts: false,
  recordsText: false,
} as const;

describe('InteractionAccessError', () => {
  it('renders a structured error message in an alert and escapes it as text', () => {
    const message = '<img src=x onerror="run()"> & input access failed';
    const status: InputAccessStatus = {
      state: 'unavailable',
      canRequest: true,
      clicks: false,
      shortcuts: false,
      recordsText: false,
      error: { code: 'input-access-failed', message },
    };

    const wrapper = mount(InteractionAccessError, { props: { status } });

    expect(wrapper.get('[role="alert"]').text()).toBe(message);
    expect(wrapper.find('img').exists()).toBe(false);
  });

  it('renders nothing when the status has no error message', () => {
    const available: InputAccessStatus = {
      state: 'available',
      canRequest: false,
      clicks: true,
      shortcuts: true,
      recordsText: false,
    };

    const availableWrapper = mount(InteractionAccessError, { props: { status: available } });
    const checkingWrapper = mount(InteractionAccessError, { props: { status: checking } });

    expect(availableWrapper.find('[role="alert"]').exists()).toBe(false);
    expect(availableWrapper.text()).toBe('');
    expect(checkingWrapper.find('[role="alert"]').exists()).toBe(false);
    expect(checkingWrapper.text()).toBe('');
  });
});
