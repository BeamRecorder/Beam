import { mount, type VueWrapper } from '@vue/test-utils';
import { nextTick } from 'vue';
import { afterEach, describe, expect, it } from 'vitest';
import TextInputDialog from './TextInputDialog.vue';

const wrappers: VueWrapper[] = [];

const mountDialog = (props: Record<string, unknown> = {}) => {
  const wrapper = mount(TextInputDialog, {
    attachTo: document.body,
    props: {
      isOpen: true,
      title: 'Name item',
      label: 'Item name',
      ...props,
    },
  });
  wrappers.push(wrapper);
  return wrapper;
};

const input = () => document.body.querySelector<HTMLInputElement>('.text-input-dialog input')!;
const button = (label: string) =>
  [...document.body.querySelectorAll<HTMLButtonElement>('.dialog-footer button')].find(
    (candidate) => candidate.textContent?.trim() === label,
  )!;

afterEach(() => {
  for (const wrapper of wrappers.splice(0)) wrapper.unmount();
  document.body.innerHTML = '';
  document.body.style.overflow = '';
});

describe('TextInputDialog', () => {
  it('loads, selects, and focuses the initial value when opened', async () => {
    mountDialog({ initialValue: 'Existing name' });
    await nextTick();

    expect(input().value).toBe('Existing name');
    expect(document.activeElement).toBe(input());
    expect(input().selectionStart).toBe(0);
    expect(input().selectionEnd).toBe('Existing name'.length);
  });

  it('keeps the dialog open and reports empty or custom-invalid values', async () => {
    const wrapper = mountDialog({ validate: (value: string) => (value === 'Taken' ? 'Already taken.' : null) });

    button('Save').click();
    await nextTick();
    expect(document.body.querySelector('[role="alert"]')?.textContent).toContain('required');
    expect(wrapper.emitted('confirm')).toBeUndefined();

    await input().focus();
    input().value = 'Taken';
    input().dispatchEvent(new Event('input', { bubbles: true }));
    button('Save').click();
    await nextTick();
    expect(document.body.querySelector('[role="alert"]')?.textContent).toBe('Already taken.');
    expect(wrapper.emitted('confirm')).toBeUndefined();
  });

  it('trims and confirms a valid name when the form is submitted', async () => {
    const wrapper = mountDialog({ confirmLabel: 'Create' });
    input().value = '  Fresh name  ';
    input().dispatchEvent(new Event('input', { bubbles: true }));
    input().dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    document.body.querySelector<HTMLFormElement>('.text-input-dialog')!.dispatchEvent(
      new Event('submit', { bubbles: true, cancelable: true }),
    );
    await nextTick();

    expect(wrapper.emitted('confirm')).toEqual([['Fresh name']]);
  });

  it('emits close from both Cancel and Escape', async () => {
    const wrapper = mountDialog();
    button('Cancel').click();
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    await nextTick();

    expect(wrapper.emitted('close')).toHaveLength(2);
  });
});
