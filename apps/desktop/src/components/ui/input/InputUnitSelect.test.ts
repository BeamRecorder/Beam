import { enableAutoUnmount, mount, flushPromises } from '@vue/test-utils';
import { afterEach, expect, it } from 'vitest';
import InputUnitSelect from './InputUnitSelect.vue';
enableAutoUnmount(afterEach);
const create = (disabled = false) =>
  mount(InputUnitSelect, {
    attachTo: document.body,
    props: {
      modelValue: 'px',
      options: [
        { value: 'px', label: 'px' },
        { value: '%', label: '%' },
      ],
      label: 'Width unit',
      disabled,
    },
    global: { stubs: { teleport: true } },
  });
it('opens the suffix menu, selects a different unit, closes and restores focus', async () => {
  const wrapper = create();
  await wrapper.get('.unit-trigger').trigger('click');
  await flushPromises();
  expect(wrapper.get('.unit-trigger').attributes('aria-expanded')).toBe('true');
  expect(document.activeElement).toBe(wrapper.get('[aria-checked="true"]').element);
  await wrapper.get('[aria-checked="false"]').trigger('click');
  await flushPromises();
  expect(wrapper.emitted('update:modelValue')).toEqual([['%']]);
  expect(wrapper.get('.unit-trigger').attributes('aria-expanded')).toBe('false');
  expect(document.activeElement).toBe(wrapper.get('.unit-trigger').element);
});
it('retains the selected unit without an event and reflects a restored unit', async () => {
  const wrapper = create();
  await wrapper.get('.unit-trigger').trigger('click');
  await flushPromises();
  await wrapper.get('[aria-checked="true"]').trigger('click');
  expect(wrapper.emitted('update:modelValue')).toBeUndefined();
  await wrapper.setProps({ modelValue: '%' });
  expect(wrapper.get('.unit-trigger').text()).toBe('%');
});
it('supports keyboard navigation, wrapping, Escape and Tab', async () => {
  const wrapper = create();
  await wrapper.get('.unit-trigger').trigger('click');
  await flushPromises();
  const menu = wrapper.get('[role="menu"]');
  const options = wrapper.findAll('[role="menuitemradio"]');
  for (const [key, index] of [
    ['ArrowDown', 1],
    ['ArrowDown', 0],
    ['ArrowUp', 1],
    ['Home', 0],
    ['End', 1],
  ] as const) {
    await menu.trigger('keydown', { key });
    expect(document.activeElement).toBe(options[index]!.element);
  }
  await menu.trigger('keydown', { key: 'q' });
  expect(document.activeElement).toBe(options[1]!.element);
  await menu.trigger('keydown', { key: 'Escape' });
  await flushPromises();
  expect(wrapper.get('.unit-trigger').attributes('aria-expanded')).toBe('false');
  expect(document.activeElement).toBe(wrapper.get('.unit-trigger').element);
  await wrapper.get('.unit-trigger').trigger('click');
  await flushPromises();
  await wrapper.get('[role="menu"]').trigger('keydown', { key: 'Tab' });
  expect(wrapper.get('.unit-trigger').attributes('aria-expanded')).toBe('false');
});
it('does not open disabled controls and closes safely when no options are available', async () => {
  const wrapper = create(true);
  await wrapper.get('.unit-trigger').trigger('click');
  expect(wrapper.find('[role="menu"]').exists()).toBe(false);
  await wrapper.setProps({ disabled: false, options: [], modelValue: 'em' });
  expect(wrapper.get('.unit-trigger').text()).toBe('em');
  await wrapper.get('.unit-trigger').trigger('click');
  await flushPromises();
  await wrapper.get('[role="menu"]').trigger('keydown', { key: 'ArrowDown' });
  await wrapper.get('[role="menu"]').trigger('keydown', { key: 'Escape' });
  expect(wrapper.emitted('update:modelValue')).toBeUndefined();
});
it('ignores selection after the field is disabled while the menu is open', async () => {
  const wrapper = create();
  await wrapper.get('.unit-trigger').trigger('click');
  await flushPromises();
  const option = wrapper.get('[aria-checked="false"]');
  await wrapper.setProps({ disabled: true });
  await option.trigger('click');
  expect(wrapper.find('[role="menu"]').exists()).toBe(false);
  expect(wrapper.emitted('update:modelValue')).toBeUndefined();
});
