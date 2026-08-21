import { mount } from '@vue/test-utils';
import { afterEach, describe, expect, it } from 'vitest';
import { nextTick } from 'vue';
import Dialog from './Dialog.vue';

afterEach(() => {
  document.body.style.overflow = '';
});

const mountDialog = (props: Record<string, unknown> = {}) =>
  mount(Dialog, {
    attachTo: document.body,
    props: { isOpen: true, ...props },
    slots: {
      default: '<p class="dialog-content-slot">Body</p>',
      footer: '<button class="footer-action">Save</button>',
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
});
