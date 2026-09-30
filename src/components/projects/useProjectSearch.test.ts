import { enableAutoUnmount, flushPromises, mount } from '@vue/test-utils';
import { defineComponent } from 'vue';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useProjectSearch } from './useProjectSearch';

enableAutoUnmount(afterEach);
const create = () => {
  let search!: ReturnType<typeof useProjectSearch>;
  let enabled = true;
  const cancelSelection = vi.fn();
  const wrapper = mount(
    defineComponent({
      setup() {
        search = useProjectSearch(() => enabled, cancelSelection);
        return () => null;
      },
    }),
  );
  const input = document.createElement('input');
  const focus = vi.spyOn(input, 'focus');
  search.searchInputRef.value = { inputRef: input };
  const type = (key: string, options: KeyboardEventInit = {}, target: EventTarget = window) => {
    const event = new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true, ...options });
    target.dispatchEvent(event);
    return event;
  };
  return {
    search,
    wrapper,
    focus,
    cancelSelection,
    type,
    disable: () => {
      enabled = false;
    },
  };
};

describe('project search keyboard entry', () => {
  it('captures the first character and rapid typing before focus, including accented letters and spaces', async () => {
    const { search, type, focus, cancelSelection } = create();
    expect(type('É').defaultPrevented).toBe(true);
    type('t');
    type('é');
    type(' ');
    type('2');
    await flushPromises();
    expect(search.isSearchOpen.value).toBe(true);
    expect(search.searchQuery.value).toBe('Été 2');
    expect(focus).toHaveBeenCalledWith({ preventScroll: true });
    expect(cancelSelection).toHaveBeenCalledTimes(5);
  });
  it.each([
    ['w', { ctrlKey: true }],
    ['w', { metaKey: true }],
    ['a', { altKey: true }],
    ['日', { isComposing: true }],
    ['Enter', {}],
    ['Dead', {}],
    [' ', {}],
  ] satisfies [string, KeyboardEventInit][])(
    'leaves shortcuts, composition and navigation untouched (%s %j)',
    (key, options) => {
      const { search, type, cancelSelection } = create();
      expect(type(key, options).defaultPrevented).toBe(false);
      expect(search.isSearchOpen.value).toBe(false);
      expect(cancelSelection).not.toHaveBeenCalled();
    },
  );
  it.each(['input', 'textarea', 'select', 'div[contenteditable="true"]', 'div[role="dialog"]', 'div[role="menu"]'])(
    'does not capture typing in %s',
    (selector) => {
      const { search, type } = create();
      const element = document.createElement(selector.split('[')[0]);
      if (selector.includes('contenteditable')) element.setAttribute('contenteditable', 'true');
      if (selector.includes('role')) element.setAttribute('role', selector.includes('dialog') ? 'dialog' : 'menu');
      document.body.append(element);
      expect(type('x', {}, element).defaultPrevented).toBe(false);
      expect(search.searchQuery.value).toBe('');
      element.remove();
    },
  );
  it('ignores consumed events, disabled contexts and events after unmount', () => {
    const { search, type, disable, wrapper } = create();
    const consumed = new KeyboardEvent('keydown', { key: 'x', cancelable: true });
    consumed.preventDefault();
    window.dispatchEvent(consumed);
    expect(search.searchQuery.value).toBe('');
    disable();
    type('x');
    expect(search.searchQuery.value).toBe('');
    wrapper.unmount();
    expect(type('x').defaultPrevented).toBe(false);
  });
});

describe('project search controls', () => {
  it('opens and focuses search, clears the query and closes with Escape in two steps', async () => {
    const { search, focus, cancelSelection } = create();
    search.toggleSearch();
    await flushPromises();
    expect(focus).toHaveBeenCalledWith({ preventScroll: true });
    expect(cancelSelection).toHaveBeenCalledOnce();
    search.searchQuery.value = 'query';
    search.handleSearchKeydown(new KeyboardEvent('keydown', { key: 'Enter' }));
    expect(search.searchQuery.value).toBe('query');
    search.handleSearchKeydown(new KeyboardEvent('keydown', { key: 'Escape' }));
    expect(search.searchQuery.value).toBe('');
    expect(search.isSearchOpen.value).toBe(true);
    search.handleSearchKeydown(new KeyboardEvent('keydown', { key: 'Escape' }));
    expect(search.isSearchOpen.value).toBe(false);
    search.toggleSearch();
    search.searchQuery.value = 'query';
    search.clearSearch();
    expect(search.searchQuery.value).toBe('');
    search.toggleSearch();
    await flushPromises();
    expect(search.isSearchOpen.value).toBe(false);
  });
  it('does not steal focus after a quick close or with an unavailable input', async () => {
    const { search, focus } = create();
    search.toggleSearch();
    search.toggleSearch();
    await flushPromises();
    expect(focus).not.toHaveBeenCalled();
    search.searchInputRef.value = null;
    search.toggleSearch();
    await flushPromises();
    search.clearSearch();
    search.searchInputRef.value = { inputRef: null };
    search.toggleSearch();
    search.toggleSearch();
    await flushPromises();
    search.clearSearch();
    expect(focus).not.toHaveBeenCalled();
  });
});
