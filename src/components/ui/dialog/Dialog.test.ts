import { mount } from '@vue/test-utils';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { nextTick } from 'vue';
import Dialog from './Dialog.vue';

afterEach(() => {
  document.body.style.overflow = '';
});

const mountDialog = (props: Record<string, unknown> = {}, slots: Record<string, string> = {}) =>
  mount(Dialog, {
    attachTo: document.body,
    props: { isOpen: true, ...props },
    slots: {
      default: '<p class="dialog-content-slot">Body</p>',
      footer: '<button class="footer-action">Save</button>',
      ...slots,
    },
  });

describe('Dialog', () => {
  it('renders title, body, footer, size and closes from its button', async () => {
    const wrapper = mountDialog({ title: 'Settings', size: 'lg' });
    await nextTick();
    const dialog = document.body.querySelector('[role="dialog"]') as HTMLElement;

    expect(dialog.classList).toContain('lg');
    expect(document.body.querySelector('.dialog-title')?.textContent).toBe('Settings');
    expect(document.body.querySelector('.dialog-content-slot')?.textContent).toBe('Body');
    expect(document.body.querySelector('.dialog-footer')?.textContent).toContain('Save');
    (document.body.querySelector('.dialog-close') as HTMLButtonElement).click();
    expect(wrapper.emitted('close')).toHaveLength(1);
    wrapper.unmount();
  });

  it('locks body scrolling while open and closes on Escape only when open', async () => {
    const wrapper = mountDialog();
    await wrapper.setProps({ isOpen: false });
    expect(document.body.style.overflow).toBe('');
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    expect(wrapper.emitted('close')).toBeUndefined();

    await wrapper.setProps({ isOpen: true });
    expect(document.body.style.overflow).toBe('hidden');
    const escape = new KeyboardEvent('keydown', { key: 'Escape', cancelable: true });
    window.dispatchEvent(escape);
    expect(wrapper.emitted('close')).toHaveLength(1);
    expect(escape.defaultPrevented).toBe(true);
    wrapper.unmount();
  });

  it('focuses the dialog, traps Tab at both ends, and restores focus to its opener', async () => {
    const opener = document.createElement('button');
    opener.textContent = 'Open dialog';
    document.body.append(opener);
    opener.focus();

    const wrapper = mountDialog();
    await nextTick();
    await nextTick();

    const dialog = document.body.querySelector<HTMLElement>('[role="dialog"]')!;
    const first = dialog.querySelector<HTMLButtonElement>('.dialog-close')!;
    const last = dialog.querySelector<HTMLButtonElement>('.footer-action')!;
    expect(document.activeElement).toBe(dialog);

    opener.focus();
    const tabFromOutside = new KeyboardEvent('keydown', { key: 'Tab', cancelable: true });
    window.dispatchEvent(tabFromOutside);
    expect(tabFromOutside.defaultPrevented).toBe(true);
    expect(document.activeElement).toBe(first);

    const tabWithin = new KeyboardEvent('keydown', { key: 'Tab', cancelable: true });
    window.dispatchEvent(tabWithin);
    expect(tabWithin.defaultPrevented).toBe(false);

    last.focus();
    const wrapForward = new KeyboardEvent('keydown', { key: 'Tab', cancelable: true });
    window.dispatchEvent(wrapForward);
    expect(wrapForward.defaultPrevented).toBe(true);
    expect(document.activeElement).toBe(first);

    const wrapBackward = new KeyboardEvent('keydown', { key: 'Tab', shiftKey: true, cancelable: true });
    window.dispatchEvent(wrapBackward);
    expect(wrapBackward.defaultPrevented).toBe(true);
    expect(document.activeElement).toBe(last);

    await wrapper.setProps({ isOpen: false });
    expect(document.activeElement).toBe(opener);
    wrapper.unmount();
    opener.remove();
  });

  it('focuses the marked action before the dialog container and skips a disabled opener on restore', async () => {
    const opener = document.createElement('button');
    document.body.append(opener);
    opener.focus();

    const wrapper = mountDialog(
      {},
      { footer: '<button data-dialog-autofocus class="preferred-action">Continue</button>' },
    );
    await nextTick();
    await nextTick();

    const preferred = document.body.querySelector<HTMLButtonElement>('.preferred-action')!;
    expect(document.activeElement).toBe(preferred);

    opener.disabled = true;
    await wrapper.setProps({ isOpen: false });
    expect(document.activeElement).not.toBe(opener);
    wrapper.unmount();
    opener.remove();
  });

  it('uses the dialog container as the Tab fallback when no focusable controls remain', async () => {
    const wrapper = mount(Dialog, {
      attachTo: document.body,
      props: { isOpen: true },
      slots: { default: '<p>Body without controls</p>' },
    });
    await nextTick();
    await nextTick();

    const dialog = document.body.querySelector<HTMLElement>('[role="dialog"]')!;
    dialog.querySelector('.dialog-close')?.remove();
    const outside = document.createElement('button');
    document.body.append(outside);
    outside.focus();

    const forward = new KeyboardEvent('keydown', { key: 'Tab', cancelable: true });
    window.dispatchEvent(forward);
    expect(forward.defaultPrevented).toBe(true);
    expect(document.activeElement).toBe(dialog);

    outside.focus();
    const backward = new KeyboardEvent('keydown', { key: 'Tab', shiftKey: true, cancelable: true });
    window.dispatchEvent(backward);
    expect(backward.defaultPrevented).toBe(true);
    expect(document.activeElement).toBe(dialog);

    const unrelatedKey = new KeyboardEvent('keydown', { key: 'ArrowDown', cancelable: true });
    window.dispatchEvent(unrelatedKey);
    expect(unrelatedKey.defaultPrevented).toBe(false);

    wrapper.unmount();
    outside.remove();
  });

  it('does not try to restore focus to a disconnected opener', async () => {
    const opener = document.createElement('button');
    document.body.append(opener);
    opener.focus();
    const focus = vi.spyOn(opener, 'focus');

    const wrapper = mountDialog();
    await nextTick();
    await nextTick();
    opener.remove();

    await wrapper.setProps({ isOpen: false });
    expect(focus).not.toHaveBeenCalled();
    wrapper.unmount();
  });

  it('closes only for a complete overlay click when enabled', async () => {
    const wrapper = mountDialog();
    await nextTick();
    const overlay = document.body.querySelector('.dialog-overlay') as HTMLElement;
    overlay.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
    overlay.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));
    expect(wrapper.emitted('close')).toHaveLength(1);

    const disabled = mountDialog({ closeOnOverlayClick: false });
    await nextTick();
    const disabledOverlay = document.body.querySelector('.dialog-overlay:last-of-type') as HTMLElement;
    disabledOverlay.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
    disabledOverlay.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));
    expect(disabled.emitted('close')).toBeUndefined();
    disabled.unmount();
    wrapper.unmount();
  });

  it('does not close when the pointer gesture starts inside the dialog and ends on the overlay', async () => {
    const wrapper = mountDialog();
    await nextTick();
    const overlay = document.body.querySelector<HTMLElement>('.dialog-overlay')!;
    const dialog = document.body.querySelector<HTMLElement>('[role="dialog"]')!;
    dialog.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
    overlay.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));

    expect(wrapper.emitted('close')).toBeUndefined();
    wrapper.unmount();
  });
});
