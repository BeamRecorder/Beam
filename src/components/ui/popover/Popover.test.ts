import { mount } from '@vue/test-utils';
import { describe, expect, it } from 'vitest';
import Popover from './Popover.vue';

const mountPopover = (props = {}) =>
  mount(Popover, {
    attachTo: document.body,
    props,
    slots: { trigger: '<button>Open</button>', default: '<p>Content</p>' },
  });
describe('Popover', () => {
  it('opens, emits state and closes with the exposed API', async () => {
    const wrapper = mountPopover();
    await wrapper.get('.popover-trigger').trigger('click');
    expect(wrapper.emitted('toggle')).toEqual([[true]]);
    expect(document.body.textContent).toContain('Content');
    (wrapper.vm as unknown as { close: () => void }).close();
    await wrapper.vm.$nextTick();
    expect(wrapper.emitted('toggle')?.at(-1)).toEqual([false]);
    wrapper.unmount();
  });
  it('closes when a click starts and ends outside', async () => {
    const wrapper = mountPopover();
    await wrapper.get('.popover-trigger').trigger('click');
    document.body.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
    document.body.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    await wrapper.vm.$nextTick();
    expect(wrapper.emitted('toggle')?.at(-1)).toEqual([false]);
    wrapper.unmount();
  });
  it('stays open when the containing window loses focus to a native dialog', async () => {
    const wrapper = mountPopover({ closeOnWindowBlur: false });
    await wrapper.get('.popover-trigger').trigger('click');
    window.dispatchEvent(new Event('blur'));
    await wrapper.vm.$nextTick();
    expect(wrapper.emitted('toggle')?.at(-1)).toEqual([true]);
    expect(document.body.textContent).toContain('Content');
    wrapper.unmount();
  });
  it('positions upward and clamps inside the viewport when space requires it', async () => {
    const wrapper = mountPopover({ align: 'right', direction: 'down', matchTriggerWidth: false });
    Object.defineProperty(wrapper.get('.popover-trigger').element, 'getBoundingClientRect', {
      value: () => ({ top: 700, bottom: 720, left: 20, right: 120, width: 100 }),
    });
    await wrapper.get('.popover-trigger').trigger('click');
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(document.querySelector('.popover-content')?.className).toContain('up');
    expect(document.querySelector('.popover-content')?.getAttribute('style')).toContain('position: fixed');
    wrapper.unmount();
  });
});
