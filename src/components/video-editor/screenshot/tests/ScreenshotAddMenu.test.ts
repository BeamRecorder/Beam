import { mount } from '@vue/test-utils';
import { describe, expect, it } from 'vitest';
import ScreenshotAddMenu from '../ScreenshotAddMenu.vue';
const PopoverMenuButton = {
  props: ['items', 'disabled'],
  emits: ['select'],
  template: '<button :disabled="disabled" @click="$emit(\'select\',\'shape\')">Add</button>',
};
describe('Screenshot single Add menu', () => {
  it('groups supported screenshot insertions into an Elements submenu', () => {
    const wrapper = mount(ScreenshotAddMenu, { global: { stubs: { PopoverMenuButton } } });
    expect(
      wrapper
        .findComponent(PopoverMenuButton)
        .props('items')
        .map((item: { id: string }) => item.id),
    ).toEqual(['insert-elements', 'cursor']);
    wrapper.unmount();
  });
  it('forwards the actual selected tool', async () => {
    const wrapper = mount(ScreenshotAddMenu, { global: { stubs: { PopoverMenuButton } } });
    await wrapper.get('button').trigger('click');
    expect(wrapper.emitted('add')).toEqual([['shape']]);
    wrapper.unmount();
  });
  it('disables insertion while unavailable', async () => {
    const wrapper = mount(ScreenshotAddMenu, { props: { disabled: true }, global: { stubs: { PopoverMenuButton } } });
    await wrapper.get('button').trigger('click');
    expect(wrapper.emitted('add')).toBeUndefined();
    wrapper.unmount();
  });
});
