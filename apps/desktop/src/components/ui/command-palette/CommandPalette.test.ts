import { mount, enableAutoUnmount, flushPromises } from '@vue/test-utils';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import CommandPalette from './CommandPalette.vue';
import Button from '../button/Button.vue';
import Input from '../input/Input.vue';
import Dialog from '../dialog/Dialog.vue';
import type { CommandPaletteItem } from './command-palette-types';
enableAutoUnmount(afterEach);
beforeEach(() => vi.spyOn(HTMLElement.prototype, 'clientHeight', 'get').mockReturnValue(336));
afterEach(() => vi.restoreAllMocks());
const mountPalette = (items: CommandPaletteItem[]) =>
  mount(CommandPalette, {
    attachTo: document.body,
    props: {
      open: true,
      items,
      title: 'Search',
      placeholder: 'Search everything',
      emptyLabel: 'Empty',
      unavailableLabel: 'Unavailable',
      closeLabel: 'Close',
      backLabel: 'Back',
    },
    global: { stubs: { teleport: true } },
  });
const options = (wrapper: ReturnType<typeof mountPalette>) => wrapper.findAll('[role="option"]');
describe('compact command palette', () => {
  it('uses a rounded neutral input, non-scaling dialog and one horizontal row with four aligned cells', async () => {
    const wrapper = mountPalette([{ id: 'add', label: 'Add', children: [{ id: 'shape', label: 'Shape' }] }]);
    await flushPromises();
    expect(wrapper.findComponent(Dialog).props('presentation')).toBe('command');
    expect(wrapper.findComponent(Input).props('appearance')).toBe('neutral');
    expect(wrapper.find('.input-neutral').exists()).toBe(true);
    const row = wrapper.get('.command-row-content');
    expect(row.element.children).toHaveLength(4);
    expect(row.get('.command-label').text()).toBe('Add');
    expect(row.get('.command-detail').text()).toBe('1');
    expect(wrapper.findComponent(Button).props('contentLayout')).toBe('label');
    const choice = wrapper.findAllComponents(Button).find((button) => button.props('contentLayout') === 'custom')!;
    expect(choice.props('contentLayout')).toBe('custom');
    expect(wrapper.text()).not.toContain('↑');
    expect(wrapper.find('.command-indicator').exists()).toBe(true);
  });
  it('opens Add, focuses the search, returns with Backspace or Back and searches all commands', async () => {
    const run = vi.fn();
    const wrapper = mountPalette([
      {
        id: 'add',
        label: 'Add',
        children: [{ id: 'shape', label: 'Shape', run }],
      },
    ]);
    await flushPromises();
    await options(wrapper)[0]!.trigger('click');
    await flushPromises();
    expect(wrapper.get('.command-breadcrumb').text()).toBe('Add');
    expect(document.activeElement).toBe(wrapper.get('input').element);
    await wrapper.get('input').trigger('keydown', { key: 'Backspace' });
    expect(wrapper.find('.command-breadcrumb').exists()).toBe(false);
    await options(wrapper)[0]!.trigger('click');
    await wrapper.get('button[aria-label="Back"]').trigger('click');
    await wrapper.get('input').setValue('Shape');
    await wrapper.get('input').trigger('keydown', { key: 'Enter' });
    await flushPromises();
    expect(run).toHaveBeenCalledOnce();
    expect(wrapper.emitted('close')).toHaveLength(1);
  });
  it('virtualizes long clip lists, emits only visible ids, scrolls to keyboard selections and retains scroll shadows', async () => {
    const wrapper = mountPalette(
      Array.from({ length: 100 }, (_, i) => ({
        id: String(i),
        label: `Clip ${i}`,
      })),
    );
    await flushPromises();
    expect(options(wrapper).length).toBeLessThan(15);
    const viewport = wrapper.get('.scroll-shadow-viewport').element as HTMLElement;
    Object.defineProperty(viewport, 'scrollHeight', { value: 4800 });
    for (let i = 0; i < 20; i++) await wrapper.get('input').trigger('keydown', { key: 'ArrowDown' });
    expect(viewport.scrollTop).toBeGreaterThan(0);
    expect(wrapper.get('#command-result-20').attributes('aria-selected')).toBe('true');
    expect(wrapper.emitted('visibleItems')?.at(-1)?.[0]).toContain('20');
    await wrapper.get('.scroll-shadow-viewport').trigger('scroll');
    await wrapper.get('input').trigger('keydown', { key: 'ArrowUp' });
    expect(wrapper.get('#command-result-19').attributes('aria-selected')).toBe('true');
    await wrapper.get('#command-result-18').trigger('mouseenter');
    expect(wrapper.get('#command-result-18').attributes('aria-selected')).toBe('true');
  });
  it('handles no matches, disabled items, empty branches and leaf items without a handler', async () => {
    const run = vi.fn();
    const wrapper = mountPalette([
      { id: 'off', label: 'Disabled', disabled: true, run },
      { id: 'empty', label: 'Empty branch', children: [] },
      { id: 'leaf', label: 'No handler' },
    ]);
    await flushPromises();
    await wrapper.get('input').trigger('keydown', { key: 'Enter' });
    expect(run).not.toHaveBeenCalled();
    await options(wrapper)[2]!.trigger('click');
    expect(wrapper.emitted('close')).toBeUndefined();
    await options(wrapper)[1]!.trigger('click');
    expect(wrapper.get('[role="status"]').text()).toBe('Empty');
    await wrapper.get('input').trigger('keydown', { key: 'ArrowDown' });
    await wrapper.get('input').trigger('keydown', { key: 'Enter' });
    await wrapper.get('input').setValue('xxx');
    await wrapper.get('input').trigger('keydown', { key: 'Backspace' });
    expect(wrapper.find('.command-breadcrumb').exists()).toBe(true);
    await wrapper.get('button[aria-label="Close"]').trigger('click');
    expect(wrapper.emitted('close')).toHaveLength(1);
  });
  it('keeps the list surface while typing and animates only when entering a different view', async () => {
    const wrapper = mountPalette([{ id: 'clips', label: 'Clips', children: [{ id: 'a', label: 'Alpha' }] }]);
    await flushPromises();
    const list = wrapper.get('.command-list').element;
    await wrapper.get('input').setValue('a');
    expect(wrapper.get('.command-list').element).toBe(list);
    await wrapper.get('input').setValue('al');
    expect(wrapper.get('.command-list').element).toBe(list);
    await wrapper.get('input').setValue('');
    await options(wrapper)[0]!.trigger('click');
    expect(wrapper.get('.command-list').element).not.toBe(list);
  });
  it('uses the mouse Back and Forward buttons without leaving the editor and cleans up listeners', async () => {
    const wrapper = mountPalette([{ id: 'clips', label: 'Clips', children: [{ id: 'a', label: 'A' }] }]);
    await flushPromises();
    await options(wrapper)[0]!.trigger('click');
    expect(wrapper.get('.command-breadcrumb').text()).toBe('Clips');
    const event = (type: string, button: number) => {
      const e = new MouseEvent(type, {
        button,
        bubbles: true,
        cancelable: true,
      });
      window.dispatchEvent(e);
      return e;
    };
    expect(event('mousedown', 3).defaultPrevented).toBe(true);
    expect(wrapper.find('.command-breadcrumb').exists()).toBe(true);
    expect(event('mouseup', 3).defaultPrevented).toBe(true);
    await flushPromises();
    expect(wrapper.find('.command-breadcrumb').exists()).toBe(false);
    expect(event('auxclick', 3).defaultPrevented).toBe(true);
    event('mouseup', 4);
    await flushPromises();
    expect(wrapper.get('.command-breadcrumb').text()).toBe('Clips');
    expect(event('mouseup', 0).defaultPrevented).toBe(false);
    await wrapper.setProps({ open: false });
    expect(event('mouseup', 3).defaultPrevented).toBe(false);
    wrapper.unmount();
    expect(event('mouseup', 3).defaultPrevented).toBe(false);
  });
  it('guards repeated async execution, recovers an error and discards late completion after unmount', async () => {
    let reject!: (error: Error) => void;
    const run = vi.fn(
      () =>
        new Promise<void>((_, fail) => {
          reject = fail;
        }),
    );
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const wrapper = mountPalette([{ id: 'async', label: 'Async', run }]);
    await flushPromises();
    await options(wrapper)[0]!.trigger('click');
    await wrapper.get('input').trigger('keydown', { key: 'Enter' });
    expect(run).toHaveBeenCalledOnce();
    reject(new Error('Failed'));
    await flushPromises();
    expect(wrapper.emitted('reopen')).toHaveLength(1);
    expect(wrapper.get('[role="alert"]').text()).toBe('Unavailable');
    await wrapper.setProps({ open: false });
    await wrapper.setProps({ open: true });
    await flushPromises();
    expect(wrapper.find('[role="alert"]').exists()).toBe(false);
    await options(wrapper)[0]!.trigger('click');
    wrapper.unmount();
    reject(new Error('Late'));
    await flushPromises();
    expect(document.querySelector('[role=dialog]')).toBeNull();
  });
});
