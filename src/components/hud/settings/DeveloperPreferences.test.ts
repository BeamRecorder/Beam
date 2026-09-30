import { flushPromises, mount } from '@vue/test-utils';
import { beforeEach, describe, expect, it, vi } from 'vitest';
const capture = vi.hoisted(() => ({ openDeveloperTools: vi.fn(), openMascotLab: vi.fn() }));
vi.mock('~/api/capture', () => ({ capture }));
import DeveloperPreferences from './DeveloperPreferences.vue';
import Button from '~/ui/button/Button.vue';

beforeEach(() => {
  vi.resetAllMocks();
  capture.openDeveloperTools.mockResolvedValue(undefined);
  capture.openMascotLab.mockResolvedValue(true);
});

describe('developer settings', () => {
  it('opens the native DevTools and independent Mascot Lab through named APIs', async () => {
    const wrapper = mount(DeveloperPreferences);
    await wrapper.get('[data-setting="devtools"] button').trigger('click');
    await flushPromises();
    expect(capture.openDeveloperTools).toHaveBeenCalledOnce();
    await wrapper.get('[data-setting="mascot-lab"] button').trigger('click');
    await flushPromises();
    expect(capture.openMascotLab).toHaveBeenCalledOnce();
    expect(wrapper.find('[role="alert"]').exists()).toBe(false);
    wrapper.unmount();
  });
  it('disables both actions while a window is loading and avoids repeat launches', async () => {
    let release: (value: boolean) => void = () => {};
    capture.openMascotLab.mockReturnValueOnce(
      new Promise<boolean>((resolve) => {
        release = resolve;
      }),
    );
    const wrapper = mount(DeveloperPreferences);
    await wrapper.get('[data-setting="mascot-lab"] button').trigger('click');
    for (const button of wrapper.findAll('button')) expect(button.attributes('disabled')).toBeDefined();
    await wrapper.get('[data-setting="mascot-lab"] button').trigger('click');
    wrapper.findComponent(Button).vm.$emit('click', new MouseEvent('click'));
    expect(capture.openMascotLab).toHaveBeenCalledOnce();
    expect(capture.openDeveloperTools).not.toHaveBeenCalled();
    release(true);
    await flushPromises();
    for (const button of wrapper.findAll('button')) expect(button.attributes('disabled')).toBeUndefined();
    wrapper.unmount();
  });
  it('shows failed openings and clears the error after a successful retry', async () => {
    const wrapper = mount(DeveloperPreferences);
    for (const reason of [new Error('Window unavailable'), 'Renderer failed']) {
      capture.openMascotLab.mockRejectedValueOnce(reason);
      await wrapper.get('[data-setting="mascot-lab"] button').trigger('click');
      await flushPromises();
      expect(wrapper.get('[role="alert"]').text()).toBe(reason instanceof Error ? reason.message : reason);
    }
    await wrapper.get('[data-setting="mascot-lab"] button').trigger('click');
    await flushPromises();
    expect(wrapper.find('[role="alert"]').exists()).toBe(false);
    wrapper.unmount();
  });
});
