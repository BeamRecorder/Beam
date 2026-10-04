import { mount } from '@vue/test-utils';
import { it, expect } from 'vitest';
import ScreenshotCompositionGroup from './ScreenshotCompositionGroup.vue';
const setup = (groupId: string | undefined, disabled = false) =>
  mount(ScreenshotCompositionGroup, {
    props: { groupId, name: 'Beam', count: 2, selected: false, disabled },
    slots: { default: '<div data-member="text">Beam</div><div data-member="logo">Logo Beam</div>' },
    global: { stubs: { RafRevealTransition: { template: '<slot />' } } },
  });
it('shows all members and toggles their accessible group disclosure', async () => {
  const wrapper = setup('brand');
  expect(wrapper.get('[data-member="logo"]').isVisible()).toBe(true);
  expect(wrapper.get('button[aria-expanded]').attributes('aria-expanded')).toBe('true');
  await wrapper.get('button[aria-expanded]').trigger('click');
  expect(wrapper.get('button[aria-expanded]').attributes('aria-expanded')).toBe('false');
  expect(wrapper.get('.group-members').attributes('inert')).toBeDefined();
  await wrapper.get('button[aria-expanded]').trigger('click');
  expect(wrapper.get('[data-member="logo"]').isVisible()).toBe(true);
  await wrapper.get('.group-select').trigger('click', { ctrlKey: true });
  expect(wrapper.emitted('select')).toHaveLength(1);
  expect((wrapper.emitted('select')![0]![0] as MouseEvent).ctrlKey).toBe(true);
  await wrapper.setProps({ selected: true });
  expect(wrapper.get('.group-heading').classes()).toContain('selected');
  wrapper.unmount();
});
it('renders standalone layers without a group header or indentation', () => {
  const wrapper = setup(undefined);
  expect(wrapper.find('.group-heading').exists()).toBe(false);
  expect(wrapper.get('.group-members').classes()).not.toContain('grouped');
  expect(wrapper.get('[data-member="logo"]').isVisible()).toBe(true);
  wrapper.unmount();
});
it('keeps export-disabled group actions inert', async () => {
  const wrapper = setup('brand', true);
  expect(wrapper.get('button[aria-expanded]').attributes('disabled')).toBeDefined();
  await wrapper.get('.group-select').trigger('click');
  expect(wrapper.emitted('select')).toBeUndefined();
  wrapper.unmount();
});
