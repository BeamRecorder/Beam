import { enableAutoUnmount, flushPromises, mount } from '@vue/test-utils';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { InputAccessStatus } from '~/api/types/input-access';
import OnboardingAccess from './OnboardingAccess.vue';
import Button from '~/ui/button/Button.vue';
const bridge = vi.hoisted(() => ({ inputAccessStatus: vi.fn(), requestInputAccess: vi.fn() }));
vi.mock('~/api/capture', () => ({ capture: bridge }));
enableAutoUnmount(afterEach);
const available: InputAccessStatus = {
  state: 'available',
  canRequest: false,
  clicks: true,
  shortcuts: true,
  recordsText: false,
};
const required: InputAccessStatus = {
  state: 'permission-required',
  canRequest: true,
  clicks: false,
  shortcuts: false,
  recordsText: false,
};
beforeEach(() => {
  vi.clearAllMocks();
  bridge.inputAccessStatus.mockReset().mockResolvedValue(required);
  bridge.requestInputAccess.mockReset().mockResolvedValue(available);
});

describe('optional onboarding interaction access', () => {
  it('checks actual status without prompting and explains that typed text is excluded', async () => {
    const wrapper = mount(OnboardingAccess, { props: { disabled: false } });
    expect(wrapper.text()).toContain('Checking');
    expect(wrapper.find('.available').exists()).toBe(false);
    await flushPromises();
    expect(bridge.inputAccessStatus).toHaveBeenCalledOnce();
    expect(bridge.requestInputAccess).not.toHaveBeenCalled();
    expect(wrapper.text()).toContain('Typed text is never recorded.');
    expect(wrapper.text()).toContain('Optional');
    expect(wrapper.text()).toContain('You can set this up later');
    await wrapper.get('button').trigger('click');
    await flushPromises();
    expect(bridge.requestInputAccess).toHaveBeenCalledOnce();
    expect(wrapper.get('.available').text()).toContain('Interaction access is ready');
    expect(wrapper.find('button').exists()).toBe(false);
  });
  it('renders available access only after the native check returns available', async () => {
    bridge.inputAccessStatus.mockResolvedValue(available);
    const wrapper = mount(OnboardingAccess, { props: { disabled: false } });
    await flushPromises();
    expect(wrapper.find('.available').exists()).toBe(true);
    expect(wrapper.find('[role="alert"]').exists()).toBe(false);
  });
  it.each(['denied', 'installation-required', 'unavailable'] as const)(
    'keeps %s visible and authorization optional',
    async (state) => {
      bridge.inputAccessStatus.mockResolvedValue({
        ...required,
        state,
        error: { code: 'native', message: 'Native helper needs attention' },
      });
      const wrapper = mount(OnboardingAccess, { props: { disabled: true } });
      await flushPromises();
      expect(wrapper.get('[role="alert"]').text()).toBe('Native helper needs attention');
      expect(wrapper.get('button').attributes('disabled')).toBeDefined();
      expect(wrapper.find('.available').exists()).toBe(false);
      expect(bridge.requestInputAccess).not.toHaveBeenCalled();
    },
  );
  it('shows a check-again action when access cannot be requested', async () => {
    bridge.inputAccessStatus.mockResolvedValue({ ...required, state: 'unavailable', canRequest: false });
    const wrapper = mount(OnboardingAccess, { props: { disabled: false } });
    await flushPromises();
    expect(wrapper.get('button').text()).toBe('Try again');
    bridge.inputAccessStatus.mockResolvedValue(available);
    await wrapper.get('button').trigger('click');
    await flushPromises();
    expect(wrapper.find('.available').exists()).toBe(true);
    expect(bridge.requestInputAccess).not.toHaveBeenCalled();
  });
  it.each([new Error('helper unavailable'), 'unknown failure'])(
    'shows check failure instead of fabricated permission: %s',
    async (reason) => {
      bridge.inputAccessStatus.mockRejectedValueOnce(reason);
      const wrapper = mount(OnboardingAccess, { props: { disabled: false } });
      await flushPromises();
      expect(wrapper.get('[role="alert"]').text()).toBe(
        reason instanceof Error ? reason.message : 'Could not check interaction access.',
      );
      expect(wrapper.find('.available').exists()).toBe(false);
      expect(wrapper.get('button').text()).toBe('Try again');
      await wrapper.get('button').trigger('click');
      await flushPromises();
      expect(wrapper.find('[role="alert"]').exists()).toBe(false);
      expect(wrapper.get('button').text()).toBe('Grant Access');
    },
  );
  it.each([new Error('request failed'), 'unknown failure'])(
    'keeps a retry available after request rejection: %s',
    async (reason) => {
      bridge.requestInputAccess.mockRejectedValue(reason);
      const wrapper = mount(OnboardingAccess, { props: { disabled: false } });
      await flushPromises();
      await wrapper.get('button').trigger('click');
      await flushPromises();
      expect(wrapper.get('[role="alert"]').text()).toBe(
        reason instanceof Error ? reason.message : 'Could not check interaction access.',
      );
      expect(wrapper.get('button').attributes('disabled')).toBeUndefined();
      expect(wrapper.get('button').text()).toBe('Try again');
    },
  );
  it('serializes pending permission requests and keeps the button disabled until they finish', async () => {
    let resolve!: (value: InputAccessStatus) => void;
    bridge.requestInputAccess.mockReturnValue(
      new Promise<InputAccessStatus>((done) => {
        resolve = done;
      }),
    );
    const wrapper = mount(OnboardingAccess, { props: { disabled: false } });
    await flushPromises();
    const button = wrapper.getComponent(Button);
    button.vm.$emit('click');
    await flushPromises();
    expect(wrapper.get('button').attributes('disabled')).toBeDefined();
    button.vm.$emit('click');
    expect(bridge.requestInputAccess).toHaveBeenCalledOnce();
    resolve(available);
    await flushPromises();
    expect(wrapper.find('.available').exists()).toBe(true);
  });
  it('ignores a status check that finishes after unmount', async () => {
    let resolve!: (value: InputAccessStatus) => void;
    bridge.inputAccessStatus.mockReturnValue(
      new Promise<InputAccessStatus>((done) => {
        resolve = done;
      }),
    );
    const wrapper = mount(OnboardingAccess, { props: { disabled: false } });
    wrapper.unmount();
    resolve(available);
    await flushPromises();
    expect(bridge.requestInputAccess).not.toHaveBeenCalled();
  });
  it('ignores native request failure after unmount', async () => {
    let reject!: (reason: Error) => void;
    bridge.requestInputAccess.mockReturnValue(
      new Promise<InputAccessStatus>((_done, fail) => {
        reject = fail;
      }),
    );
    const wrapper = mount(OnboardingAccess, { props: { disabled: false } });
    await flushPromises();
    await wrapper.get('button').trigger('click');
    wrapper.unmount();
    reject(new Error('gone'));
    await flushPromises();
    expect(bridge.requestInputAccess).toHaveBeenCalledOnce();
  });
});
