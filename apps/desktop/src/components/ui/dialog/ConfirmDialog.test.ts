import { mount } from '@vue/test-utils';
import { afterEach, describe, expect, it } from 'vitest';
import { nextTick } from 'vue';
import ConfirmDialog from './ConfirmDialog.vue';

const mountedWrappers: Array<{ unmount: () => void }> = [];

const mountDialog = (props: Record<string, unknown> = {}) => {
  const wrapper = mount(ConfirmDialog, {
    attachTo: document.body,
    props: {
      isOpen: true,
      title: 'Delete preset?',
      description: 'The preset will be permanently deleted.',
      confirmLabel: 'Delete',
      destructive: true,
      ...props,
    },
  });
  mountedWrappers.push(wrapper);
  return wrapper;
};

afterEach(() => {
  for (const wrapper of mountedWrappers.splice(0)) wrapper.unmount();
  document.body.innerHTML = '';
  document.body.style.overflow = '';
});

describe('ConfirmDialog', () => {
  it('renders the confirmation copy and emits close or confirm from its actions', async () => {
    const wrapper = mountDialog();
    await nextTick();

    expect(document.body.querySelector('.dialog-title')?.textContent).toBe('Delete preset?');
    expect(document.body.querySelector('.confirm-description')?.textContent).toContain('permanently deleted');
    expect(document.body.querySelector('.dialog-footer .btn-danger')).not.toBeNull();

    const buttons = document.body.querySelectorAll<HTMLButtonElement>('.dialog-footer button');
    expect(buttons).toHaveLength(2);
    buttons[0]?.click();
    buttons[1]?.click();
    expect(wrapper.emitted('close')).toHaveLength(1);
    expect(wrapper.emitted('confirm')).toHaveLength(1);
  });

  it('disables both actions and the overlay close while busy', async () => {
    const wrapper = mountDialog({ busy: true });
    await nextTick();

    const buttons = document.body.querySelectorAll<HTMLButtonElement>('.dialog-footer button');
    expect([...buttons].every((button) => button.disabled)).toBe(true);

    const overlay = document.body.querySelector<HTMLElement>('.dialog-overlay')!;
    overlay.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
    overlay.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));
    expect(wrapper.emitted('close')).toBeUndefined();
  });
});
