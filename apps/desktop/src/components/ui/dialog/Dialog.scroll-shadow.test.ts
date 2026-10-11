import { enableAutoUnmount, mount } from '@vue/test-utils';
import { afterEach, expect, it } from 'vitest';
import Dialog from './Dialog.vue';
import ScrollShadow from '../scroll-shadow/ScrollShadow.vue';

enableAutoUnmount(afterEach);
const create = (scrollShadow: boolean) =>
  mount(Dialog, {
    props: { isOpen: true, title: 'Export', scrollShadow },
    slots: { default: '<p class="options">Export options</p>', footer: '<button>Export</button>' },
    global: { stubs: { teleport: true } },
  });

it('keeps the ordinary dialog body when scroll shadows are disabled', () => {
  const wrapper = create(false);
  expect(wrapper.findComponent(ScrollShadow).exists()).toBe(false);
  expect(wrapper.get('.dialog-body .options').text()).toBe('Export options');
  expect(wrapper.get('.dialog-footer button').text()).toBe('Export');
});

it('scrolls only the body through one shared shadow viewport with a stable scrollbar', () => {
  const wrapper = create(true);
  const scroll = wrapper.getComponent(ScrollShadow);
  expect(scroll.props('stableScrollbar')).toBe(true);
  expect(scroll.props('hideScrollbar')).toBe(false);
  expect(scroll.get('.dialog-body .options').text()).toBe('Export options');
  expect(scroll.find('.dialog-header').exists()).toBe(false);
  expect(scroll.find('.dialog-footer').exists()).toBe(false);
  expect(wrapper.findAll('.scroll-shadow-viewport')).toHaveLength(1);
  expect(wrapper.get('.dialog-footer button').text()).toBe('Export');
});

it('restores the standard body if the caller disables shadows', async () => {
  const wrapper = create(true);
  await wrapper.setProps({ scrollShadow: false });
  expect(wrapper.find('.scroll-shadow-viewport').exists()).toBe(false);
  expect(wrapper.findAll('.dialog-body')).toHaveLength(1);
  expect(wrapper.get('.dialog-body .options').text()).toBe('Export options');
});
