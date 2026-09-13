import { defineComponent, h, ref } from 'vue';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { mount } from '@vue/test-utils';
import type { ScreenshotLayer } from '../screenshot-layer-types';
import { useScreenshotLayerShortcuts } from '../useScreenshotLayerShortcuts';

const makeLayer = (
  kind: ScreenshotLayer['kind'] = 'shape',
  overrides: Partial<ScreenshotLayer> = {},
): ScreenshotLayer => ({
  id: 'layer-1',
  kind,
  name: 'Layer 1',
  opacity: 100,
  blendMode: 'source-over',
  locked: false,
  visible: true,
  ...overrides,
});

const wrappers: Array<{ unmount: () => void }> = [];
const dialogs: HTMLElement[] = [];

const mountShortcuts = (initialSelection?: ScreenshotLayer, initialDisabled = false) => {
  const selected = ref(initialSelection);
  const disabled = ref(initialDisabled);
  const remove = vi.fn();
  const Host = defineComponent({
    setup() {
      useScreenshotLayerShortcuts(
        () => selected.value,
        () => disabled.value,
        remove,
      );
      return () =>
        h('div', { 'data-testid': 'host' }, [
          h('div', { 'data-testid': 'plain-target' }),
          h('input', { 'data-testid': 'input' }),
          h('textarea', { 'data-testid': 'textarea' }),
          h('select', { 'data-testid': 'select' }, [h('option', { value: 'one' }, 'One')]),
          h('div', { 'data-testid': 'editable', contenteditable: 'true' }),
          h('div', { 'data-testid': 'textbox', role: 'textbox' }),
          h('div', { 'data-testid': 'menu', role: 'menu' }, [h('button', 'Delete')]),
          h('div', { class: 'popover-content' }, [h('button', { 'data-testid': 'popover-button' }, 'Open')]),
        ]);
    },
  });
  const wrapper = mount(Host, { attachTo: document.body });
  wrappers.push(wrapper);
  return { wrapper, selected, disabled, remove };
};

const dispatchKey = (
  target: EventTarget,
  key = 'Delete',
  init: KeyboardEventInit = {},
  preventBeforeDispatch = false,
) => {
  const event = new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true, ...init });
  if (preventBeforeDispatch) event.preventDefault();
  target.dispatchEvent(event);
  return event;
};

afterEach(() => {
  for (const wrapper of wrappers.splice(0)) wrapper.unmount();
  for (const dialog of dialogs.splice(0)) dialog.remove();
  vi.restoreAllMocks();
});

describe('useScreenshotLayerShortcuts', () => {
  it.each(['Delete', 'Backspace'])('removes a selected removable layer on %s', (key) => {
    const { remove } = mountShortcuts(makeLayer('text'));

    const event = dispatchKey(window, key);

    expect(event.defaultPrevented).toBe(true);
    expect(remove).toHaveBeenCalledOnce();
    expect(remove).toHaveBeenCalledWith('layer-1');
  });

  it('handles bubbling keyboard events from a normal element without blocking unrelated controls', () => {
    const { wrapper, remove } = mountShortcuts(makeLayer('cursor'));

    const event = dispatchKey(wrapper.get('[data-testid="plain-target"]').element);

    expect(event.defaultPrevented).toBe(true);
    expect(remove).toHaveBeenCalledWith('layer-1');
  });

  it.each([
    ['another key', 'Escape', {}, false],
    ['an already-prevented key', 'Delete', {}, true],
    ['a repeated key', 'Delete', { repeat: true }, false],
    ['an IME composition key', 'Delete', { isComposing: true }, false],
    ['a control-modified key', 'Delete', { ctrlKey: true }, false],
    ['a command-modified key', 'Delete', { metaKey: true }, false],
    ['an alt-modified key', 'Delete', { altKey: true }, false],
    ['a shift-modified key', 'Delete', { shiftKey: true }, false],
  ] as const)('ignores %s', (_label, key, init, preventBeforeDispatch) => {
    const { remove } = mountShortcuts(makeLayer());

    const event = dispatchKey(window, key, init, preventBeforeDispatch);

    expect(remove).not.toHaveBeenCalled();
    expect(event.defaultPrevented).toBe(preventBeforeDispatch);
  });

  it('ignores Delete from inputs, text editing, and popover content', () => {
    const { wrapper, remove } = mountShortcuts(makeLayer('text'));
    const targets = [
      wrapper.get('[data-testid="input"]').element,
      wrapper.get('[data-testid="textarea"]').element,
      wrapper.get('[data-testid="select"]').element,
      wrapper.get('[data-testid="editable"]').element,
      wrapper.get('[data-testid="textbox"]').element,
      wrapper.get('[data-testid="popover-button"]').element,
    ];

    for (const target of targets) {
      const event = dispatchKey(target);
      expect(event.defaultPrevented).toBe(false);
    }

    expect(remove).not.toHaveBeenCalled();
  });

  it('ignores Delete from a menu', () => {
    const { wrapper, remove } = mountShortcuts(makeLayer('text'));

    const event = dispatchKey(wrapper.get('[data-testid="menu"]').element);

    expect(event.defaultPrevented).toBe(false);
    expect(remove).not.toHaveBeenCalled();
  });

  it('ignores Delete while a modal dialog is present', () => {
    const { wrapper, remove } = mountShortcuts(makeLayer());
    const dialog = document.createElement('div');
    dialog.setAttribute('role', 'dialog');
    dialog.setAttribute('aria-modal', 'true');
    document.body.append(dialog);
    dialogs.push(dialog);

    const event = dispatchKey(wrapper.get('[data-testid="plain-target"]').element);

    expect(event.defaultPrevented).toBe(false);
    expect(remove).not.toHaveBeenCalled();
  });

  it.each([
    ['no selected layer', undefined],
    ['a locked layer', makeLayer('shape', { locked: true })],
    ['the screenshot image', makeLayer('image')],
    ['the background', makeLayer('background')],
    ['the watermark', makeLayer('watermark')],
  ])('does not delete %s', (_label, selected) => {
    const { remove } = mountShortcuts(selected);

    const event = dispatchKey(window);

    expect(event.defaultPrevented).toBe(false);
    expect(remove).not.toHaveBeenCalled();
  });

  it('does not delete while the editor is disabled and uses the latest selected layer', () => {
    const { selected, disabled, remove } = mountShortcuts(undefined, true);

    const disabledEvent = dispatchKey(window);
    expect(disabledEvent.defaultPrevented).toBe(false);
    expect(remove).not.toHaveBeenCalled();

    disabled.value = false;
    selected.value = makeLayer('drawing', { id: 'drawing-2' });
    const enabledEvent = dispatchKey(window, 'Backspace');

    expect(enabledEvent.defaultPrevented).toBe(true);
    expect(remove).toHaveBeenCalledOnce();
    expect(remove).toHaveBeenCalledWith('drawing-2');
  });

  it('removes its global keyboard listener when the editor scope is disposed', () => {
    const { wrapper, remove } = mountShortcuts(makeLayer());
    wrapper.unmount();

    const event = dispatchKey(window);

    expect(event.defaultPrevented).toBe(false);
    expect(remove).not.toHaveBeenCalled();
  });
});
