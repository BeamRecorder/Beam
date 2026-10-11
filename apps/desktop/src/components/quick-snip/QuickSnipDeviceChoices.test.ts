import { enableAutoUnmount, flushPromises, mount } from '@vue/test-utils';
import { afterEach, expect, it } from 'vitest';
import QuickSnipDeviceChoices from './QuickSnipDeviceChoices.vue';
enableAutoUnmount(afterEach);
const menu = {
  kind: 'microphone' as const,
  selectedId: 'usb',
  position: { x: 100, y: 54 },
  options: [
    { id: 'off', label: 'Off' },
    { id: 'usb', label: 'USB mic' },
    { id: 'default', label: 'Default' },
  ],
};
it('focuses and marks the selected device in the shared menu', async () => {
  const wrapper = mount(QuickSnipDeviceChoices, { props: { menu }, attachTo: document.body });
  await flushPromises();
  const buttons = wrapper.findAll('button');
  expect(document.activeElement).toBe(buttons[1].element);
  expect(buttons[1].find('.lucide-check').exists()).toBe(true);
  expect(buttons.map((button) => button.attributes('role'))).toEqual(menu.options.map(() => 'menuitemradio'));
  expect(buttons.map((button) => button.attributes('aria-checked'))).toEqual(['false', 'true', 'false']);
  expect(buttons.every((button) => button.find('.item-check-wrapper').exists())).toBe(true);
  expect(buttons.every((button) => !button.find('.item-icon-wrapper').exists())).toBe(true);
  await buttons[0].trigger('click');
  expect(wrapper.emitted('select')).toEqual([['off']]);
});
it('supports keyboard navigation and Escape dismissal', async () => {
  const wrapper = mount(QuickSnipDeviceChoices, { props: { menu }, attachTo: document.body });
  await flushPromises();
  const buttons = wrapper.findAll('button');
  await buttons[1].trigger('keydown', { key: 'ArrowDown' });
  expect(document.activeElement).toBe(buttons[2].element);
  await buttons[2].trigger('keydown', { key: 'Escape' });
  expect(wrapper.emitted('dismiss')).toHaveLength(1);
});
it('refocuses a replacement menu and handles an empty list', async () => {
  const wrapper = mount(QuickSnipDeviceChoices, { props: { menu }, attachTo: document.body });
  await flushPromises();
  await wrapper.setProps({ menu: { ...menu, selectedId: 'off' } });
  await flushPromises();
  expect(document.activeElement).toBe(wrapper.findAll('button')[0].element);
  await wrapper.setProps({ menu: { ...menu, options: [] } });
  await flushPromises();
  expect(wrapper.findAll('button')).toHaveLength(0);
});
it('focuses the first option when a saved device is no longer available', async () => {
  const wrapper = mount(QuickSnipDeviceChoices, {
    props: { menu: { ...menu, selectedId: 'unplugged' } },
    attachTo: document.body,
  });
  await flushPromises();
  expect(document.activeElement).toBe(wrapper.findAll('button')[0].element);
  expect(wrapper.find('.lucide-check').exists()).toBe(false);
  expect(wrapper.findAll('button').every((button) => button.attributes('aria-checked') === 'false')).toBe(true);
});
