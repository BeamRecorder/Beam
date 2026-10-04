import { it, expect, vi } from 'vitest';
import { mount } from '@vue/test-utils';
import { defineComponent } from 'vue';
import ScreenshotEffectToolbar from './ScreenshotEffectToolbar.vue';
import PopoverMenuList from '~/ui/popover/PopoverMenuList.vue';
vi.mock('~/i18n/useTranslate', () => ({ useTranslate: () => ({ t: (key: string) => key }) }));
const close = vi.fn();
const Popover = defineComponent({
  props: ['disabled', 'direction'],
  template: '<div><slot name="trigger" :is-open="false" /><slot :close="close" /></div>',
  setup: () => ({ close }),
});
it('offers two compact icon menus and actual gradient/color/monochrome tools', () => {
  const wrapper = mount(ScreenshotEffectToolbar, { global: { stubs: { Popover } } });
  expect(wrapper.findAll('[data-effect-menu]')).toHaveLength(2);
  expect(wrapper.get('[data-effect-menu="effects"]').text()).toBe('');
  expect(wrapper.get('[data-effect-menu="color"]').attributes('aria-label')).toBe('color');
  const menus = wrapper.findAllComponents(PopoverMenuList);
  expect(menus[0]!.props('items').map((item) => item.id)).toEqual(['gradient']);
  expect(menus[1]!.props('items').map((item) => item.id)).toEqual(['color-adjustment', 'grayscale']);
  wrapper.unmount();
});
it('routes chosen tools and closes both menus on selection or dismissal', () => {
  close.mockClear();
  const wrapper = mount(ScreenshotEffectToolbar, { props: { direction: 'up' }, global: { stubs: { Popover } } });
  const menus = wrapper.findAllComponents(PopoverMenuList);
  menus[0]!.vm.$emit('select', 'gradient');
  menus[1]!.vm.$emit('select', 'grayscale');
  menus[1]!.vm.$emit('dismiss');
  expect(wrapper.emitted('add')).toEqual([['gradient'], ['grayscale']]);
  expect(close).toHaveBeenCalledTimes(3);
  wrapper.unmount();
});
it('disables both triggers and guards stale selections on locked/full/busy owners', () => {
  const wrapper = mount(ScreenshotEffectToolbar, { props: { disabled: true }, global: { stubs: { Popover } } });
  expect(wrapper.findAll('[data-effect-menu]').every((button) => button.attributes('disabled') !== undefined)).toBe(
    true,
  );
  wrapper.findComponent(PopoverMenuList).vm.$emit('select', 'gradient');
  expect(wrapper.emitted('add')).toBeUndefined();
  wrapper.unmount();
});
