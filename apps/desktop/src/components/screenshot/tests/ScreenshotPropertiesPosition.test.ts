import { afterEach, expect, it, vi } from 'vitest';
import { enableAutoUnmount, flushPromises, mount } from '@vue/test-utils';
import ScreenshotPropertiesPosition from '../ScreenshotPropertiesPosition.vue';
import PopoverMenuList from '~/ui/popover/PopoverMenuList.vue';
enableAutoUnmount(afterEach);
it.each(['left', 'right', 'floating'] as const)(
  'offers %s as a checked placement and emits an explicit choice',
  async (position) => {
    const wrapper = mount(ScreenshotPropertiesPosition, { props: { modelValue: position }, attachTo: document.body });
    await wrapper.get('[aria-label="Properties position"]').trigger('click');
    await flushPromises();
    const list = wrapper.getComponent(PopoverMenuList);
    const items = list.props('items');
    expect(items.map((item) => ({ id: item.id, checked: item.checked }))).toEqual([
      { id: 'left', checked: position === 'left' },
      { id: 'right', checked: position === 'right' },
      { id: 'floating', checked: position === 'floating' },
    ]);
    list.vm.$emit('select', position);
    await flushPromises();
    expect(wrapper.emitted('update:modelValue')).toEqual([[position]]);
    expect(wrapper.get('[aria-label="Properties position"]').attributes('aria-expanded')).toBe('false');
  },
);
it('ignores unknown menu actions and blocks the trigger during persistence', async () => {
  const wrapper = mount(ScreenshotPropertiesPosition, { props: { modelValue: 'left' }, attachTo: document.body });
  await wrapper.get('[aria-label="Properties position"]').trigger('click');
  await flushPromises();
  wrapper.getComponent(PopoverMenuList).vm.$emit('select', 'unknown');
  expect(wrapper.emitted('update:modelValue')).toBeUndefined();
  await wrapper.setProps({ disabled: true });
  expect(wrapper.get('[aria-label="Properties position"]').attributes('disabled')).toBeDefined();
});

it('rejects a placement event received while saving', () => {
  const wrapper = mount(ScreenshotPropertiesPosition, {
    props: { modelValue: 'left', disabled: true },
    global: {
      stubs: {
        Popover: {
          methods: { close: vi.fn() },
          template: '<div><slot name="trigger" :isOpen="true"/><slot :close="close"/></div>',
        },
      },
    },
  });
  wrapper.getComponent(PopoverMenuList).vm.$emit('select', 'right');
  expect(wrapper.emitted('update:modelValue')).toBeUndefined();
});
