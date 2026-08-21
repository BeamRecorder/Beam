import { mount } from '@vue/test-utils';
import { Trash2 } from '@lucide/vue';
import { describe, expect, it, vi } from 'vitest';
import ContextMenu from './ContextMenu.vue';
import ContextMenuItem from './ContextMenuItem.vue';

describe('ContextMenu', () => {
  it('opens via open() method, renders items and emits select', async () => {
    const items = [
      { id: 'hold', label: 'Hold segment' },
      { id: 'copy', label: 'Copy', shortcut: 'Ctrl+C' },
      { isDivider: true as const },
      { id: 'delete', label: 'Delete', danger: true },
    ];
    const wrapper = mount(ContextMenu, {
      attachTo: document.body,
      props: { items },
    });

    expect(document.body.querySelector('.context-menu-surface')).toBeNull();

    // Call open
    (wrapper.vm as unknown as { open: (pos: { x: number; y: number }) => void }).open({ x: 100, y: 150 });
    await wrapper.vm.$nextTick();

    const surface = document.body.querySelector('.context-menu-surface');
    expect(surface).not.toBeNull();
    expect(surface?.textContent).toContain('Hold segment');
    expect(surface?.textContent).toContain('Copy');
    expect(surface?.textContent).toContain('Delete');
    expect(document.body.querySelector('.context-menu-divider')).not.toBeNull();

    // Click on Copy item
    const copyButton = document.body.querySelectorAll<HTMLButtonElement>('.context-menu-item')[1];
    copyButton.click();
    await wrapper.vm.$nextTick();

    expect(wrapper.emitted('select')).toEqual([['copy']]);
    expect(wrapper.emitted('update:isOpen')?.at(-1)).toEqual([false]);
    wrapper.unmount();
  });

  it('handles disabled items without triggering selection or closing', async () => {
    const items = [{ id: 'paste', label: 'Paste', disabled: true }];
    const wrapper = mount(ContextMenu, {
      attachTo: document.body,
      props: { isOpen: true, x: 50, y: 50, items },
    });
    await wrapper.vm.$nextTick();

    const pasteButton = document.body.querySelector<HTMLButtonElement>('.context-menu-item');
    expect(pasteButton?.disabled).toBe(true);
    expect(pasteButton?.classList.contains('is-disabled')).toBe(true);

    pasteButton?.click();
    await wrapper.vm.$nextTick();

    expect(wrapper.emitted('select')).toBeUndefined();
    expect(wrapper.emitted('update:isOpen')).toBeUndefined();
    wrapper.unmount();
  });

  it('closes on click outside but stays open on click inside', async () => {
    const wrapper = mount(ContextMenu, {
      attachTo: document.body,
      props: {
        isOpen: true,
        x: 100,
        y: 100,
      },
      slots: {
        default: '<div class="custom-content">Menu Content</div>',
      },
    });
    await wrapper.vm.$nextTick();

    const surface = document.body.querySelector('.context-menu-surface');
    expect(surface).not.toBeNull();

    // Click inside
    surface?.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true }));
    await wrapper.vm.$nextTick();
    expect(wrapper.emitted('close')).toBeUndefined();

    // Click outside
    document.body.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true }));
    await wrapper.vm.$nextTick();
    expect(wrapper.emitted('close')).toBeDefined();

    wrapper.unmount();
  });

  it('closes on Escape key press', async () => {
    const wrapper = mount(ContextMenu, {
      attachTo: document.body,
      props: { isOpen: true, x: 100, y: 100 },
    });
    await wrapper.vm.$nextTick();

    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    await wrapper.vm.$nextTick();

    expect(wrapper.emitted('close')).toBeDefined();
    wrapper.unmount();
  });

  it('ContextMenuItem renders slot content, danger state and emits click', async () => {
    const clickSpy = vi.fn();
    const wrapper = mount(ContextMenuItem, {
      props: { label: 'Delete Clip', icon: Trash2, danger: true, shortcut: 'Del' },
      attrs: { onClick: clickSpy },
    });

    expect(wrapper.classes()).toContain('is-danger');
    expect(wrapper.text()).toContain('Delete Clip');
    expect(wrapper.text()).toContain('Del');
    expect(wrapper.get('.item-icon-wrapper').attributes('aria-hidden')).toBe('true');

    await wrapper.trigger('click');
    expect(clickSpy).toHaveBeenCalled();
  });
});
