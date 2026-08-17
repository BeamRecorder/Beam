import { mount } from '@vue/test-utils';
import { afterEach, describe, expect, it, vi } from 'vitest';
import Popover from './Popover.vue';

const mountPopover = (props = {}) =>
  mount(Popover, {
    attachTo: document.body,
    props,
    slots: { trigger: '<button>Open</button>', default: '<p>Content</p>' },
  });
describe('Popover', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

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

  it('opens on hover and keeps the teleported content open while it is hovered', async () => {
    vi.useFakeTimers();
    const wrapper = mountPopover({ interaction: 'hover-focus-click', closeDelay: 25 });
    const trigger = wrapper.get('.popover-trigger');

    await trigger.trigger('mouseenter');
    expect(document.querySelector('.popover-content')).not.toBeNull();

    await trigger.trigger('mouseleave');
    const content = document.querySelector('.popover-content') as HTMLElement;
    content.dispatchEvent(new MouseEvent('mouseenter', { bubbles: true }));
    vi.advanceTimersByTime(50);
    await wrapper.vm.$nextTick();
    expect(document.querySelector('.popover-content')).not.toBeNull();

    content.dispatchEvent(new MouseEvent('mouseleave', { bubbles: true }));
    vi.advanceTimersByTime(25);
    await wrapper.vm.$nextTick();
    expect(wrapper.emitted('toggle')?.at(-1)).toEqual([false]);
    wrapper.unmount();
  });

  it('opens on focus and closes on Escape or focus loss', async () => {
    vi.useFakeTimers();
    const wrapper = mountPopover({ interaction: 'hover-focus-click', closeDelay: 25 });
    const trigger = wrapper.get('.popover-trigger');

    await trigger.trigger('focusin');
    expect(wrapper.emitted('toggle')).toContainEqual([true]);
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    await wrapper.vm.$nextTick();
    expect(wrapper.emitted('toggle')?.at(-1)).toEqual([false]);

    await trigger.trigger('focusin');
    await trigger.trigger('focusout');
    vi.advanceTimersByTime(25);
    await wrapper.vm.$nextTick();
    expect(wrapper.emitted('toggle')?.at(-1)).toEqual([false]);
    wrapper.unmount();
  });

  it('pins hover content on click and unpins it on the next click', async () => {
    vi.useFakeTimers();
    const wrapper = mountPopover({ interaction: 'hover-focus-click', closeDelay: 25 });
    const trigger = wrapper.get('.popover-trigger');

    await trigger.trigger('click');
    await trigger.trigger('mouseleave');
    vi.advanceTimersByTime(50);
    await wrapper.vm.$nextTick();
    expect(wrapper.emitted('toggle')?.at(-1)).toEqual([true]);

    await trigger.trigger('click');
    await wrapper.vm.$nextTick();
    expect(wrapper.emitted('toggle')?.at(-1)).toEqual([false]);
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
