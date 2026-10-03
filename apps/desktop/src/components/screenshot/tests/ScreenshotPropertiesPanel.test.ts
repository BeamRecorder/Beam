import { enableAutoUnmount, mount } from '@vue/test-utils';
import { afterEach, expect, it } from 'vitest';
import ScreenshotPropertiesPanel from '../ScreenshotPropertiesPanel.vue';
import ScrollShadow from '~/ui/scroll-shadow/ScrollShadow.vue';
enableAutoUnmount(afterEach);
it('reserves the scrollbar gutter in the inspector and retains controls across closing', async () => {
  const wrapper = mount(ScreenshotPropertiesPanel, {
    props: { open: true, title: 'Image' },
    slots: { default: '<input aria-label="Width">' },
  });
  const input = wrapper.get('input').element;
  expect(wrapper.findComponent(ScrollShadow).props('stableScrollbar')).toBe(true);
  await wrapper.setProps({ open: false });
  expect(wrapper.get('aside').attributes('inert')).toBeDefined();
  await wrapper.setProps({ open: true });
  expect(wrapper.get('aside').attributes('inert')).toBeUndefined();
  expect(wrapper.get('input').element).toBe(input);
});
it('keeps custom header actions and the close control independent from property content', async () => {
  const wrapper = mount(ScreenshotPropertiesPanel, {
    props: { open: true, title: 'Image' },
    slots: {
      title: '<span class="custom-title">Selected image</span>',
      actions: '<button class="custom-action">Action</button>',
    },
  });
  expect(wrapper.get('.custom-title').text()).toBe('Selected image');
  await wrapper.get('.custom-action').trigger('click');
  expect(wrapper.emitted('close')).toBeUndefined();
  await wrapper.get('[aria-label="Close"]').trigger('click');
  expect(wrapper.emitted('close')).toEqual([[]]);
});
it('reserves space for an optional footer only when one is provided', async () => {
  const plain = mount(ScreenshotPropertiesPanel, { props: { open: true, title: 'Image' } });
  expect(plain.find('footer').exists()).toBe(false);
  expect(plain.findComponent(ScrollShadow).classes()).not.toContain('has-footer');
  const footer = mount(ScreenshotPropertiesPanel, {
    props: { open: true, title: 'Image' },
    slots: { footer: '<button>Delete</button>' },
  });
  expect(footer.get('footer').text()).toBe('Delete');
  expect(footer.findComponent(ScrollShadow).classes()).toContain('has-footer');
});
