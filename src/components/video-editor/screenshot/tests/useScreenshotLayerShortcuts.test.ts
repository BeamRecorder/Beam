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

const mountShortcuts = (
  initialSelection?: ScreenshotLayer,
  initialDisabled = false,
  outcomes: { copy?: boolean; cut?: boolean; paste?: boolean } = {},
) => {
  const selected = ref(initialSelection);
  const disabled = ref(initialDisabled);
  const remove = vi.fn();
  const copy = vi.fn(() => outcomes.copy ?? true);
  const cut = vi.fn(() => outcomes.cut ?? true);
  const paste = vi.fn(() => outcomes.paste ?? true);
  const Host = defineComponent({
    setup() {
      useScreenshotLayerShortcuts({
        selected: () => selected.value,
        disabled: () => disabled.value,
        remove,
        copy,
        cut,
        paste,
      });
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
  return { wrapper, selected, disabled, remove, copy, cut, paste };
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

const dispatchPaste = (target: EventTarget, items: Array<{ kind: string; type: string }> = []) => {
  // jsdom does not expose ClipboardEvent, so use it when available and retain the
  // same cancelable event shape in the test environment.
  const event = globalThis.ClipboardEvent
    ? new globalThis.ClipboardEvent('paste', { bubbles: true, cancelable: true })
    : new Event('paste', { bubbles: true, cancelable: true });
  Object.defineProperty(event, 'clipboardData', { configurable: true, value: { items } });
  target.dispatchEvent(event);
  return event;
};

afterEach(() => {
  for (const wrapper of wrappers.splice(0)) wrapper.unmount();
  for (const dialog of dialogs.splice(0)) dialog.remove();
  vi.restoreAllMocks();
});

describe('useScreenshotLayerShortcuts', () => {
  it.each([
    ['Ctrl+C', 'c', { ctrlKey: true }, 'copy'],
    ['Cmd+C', 'c', { metaKey: true }, 'copy'],
    ['Ctrl+X', 'x', { ctrlKey: true }, 'cut'],
    ['Cmd+X', 'x', { metaKey: true }, 'cut'],
  ] as const)('handles %s through the matching callback', (_label, key, modifiers, action) => {
    const { copy, cut, paste } = mountShortcuts(makeLayer());

    const event = dispatchKey(window, key, modifiers);

    expect(event.defaultPrevented).toBe(true);
    expect({ copy, cut, paste }[action]).toHaveBeenCalledOnce();
    expect(copy).toHaveBeenCalledTimes(action === 'copy' ? 1 : 0);
    expect(cut).toHaveBeenCalledTimes(action === 'cut' ? 1 : 0);
    expect(paste).not.toHaveBeenCalled();
  });

  it('does not claim clipboard shortcuts when there is no selection', () => {
    const { copy, cut } = mountShortcuts(undefined, false, {
      copy: false,
      cut: false,
    });

    for (const [key, modifiers] of [
      ['c', { ctrlKey: true }],
      ['x', { metaKey: true }],
    ] as const) {
      const event = dispatchKey(window, key, modifiers);
      expect(event.defaultPrevented).toBe(false);
    }

    expect(copy).toHaveBeenCalledOnce();
    expect(cut).toHaveBeenCalledOnce();
  });

  it('pastes internal layers from a paste event without image data', () => {
    const { paste } = mountShortcuts(makeLayer());

    const event = dispatchPaste(window);

    expect(event.defaultPrevented).toBe(true);
    expect(paste).toHaveBeenCalledOnce();
  });

  it('leaves image paste events unclaimed for the image handler', () => {
    const { paste } = mountShortcuts(makeLayer());

    const event = dispatchPaste(window, [{ kind: 'file', type: 'image/png' }]);

    expect(event.defaultPrevented).toBe(false);
    expect(paste).not.toHaveBeenCalled();
  });

  it('ignores clipboard shortcuts from editable controls, menus, and popovers', () => {
    const { wrapper, copy, cut, paste } = mountShortcuts(makeLayer());
    const targets = [
      wrapper.get('[data-testid="input"]').element,
      wrapper.get('[data-testid="textarea"]').element,
      wrapper.get('[data-testid="select"]').element,
      wrapper.get('[data-testid="editable"]').element,
      wrapper.get('[data-testid="textbox"]').element,
      wrapper.get('[data-testid="menu"]').element,
      wrapper.get('[data-testid="popover-button"]').element,
    ];

    for (const target of targets) {
      for (const [key, modifiers] of [
        ['c', { ctrlKey: true }],
        ['x', { metaKey: true }],
      ] as const) {
        const event = dispatchKey(target, key, modifiers);
        expect(event.defaultPrevented).toBe(false);
      }
    }

    expect(copy).not.toHaveBeenCalled();
    expect(cut).not.toHaveBeenCalled();
    expect(paste).not.toHaveBeenCalled();
  });

  it('ignores clipboard shortcuts while a modal dialog is present', () => {
    const { copy, cut, paste } = mountShortcuts(makeLayer());
    const dialog = document.createElement('div');
    dialog.setAttribute('role', 'dialog');
    dialog.setAttribute('aria-modal', 'true');
    document.body.append(dialog);
    dialogs.push(dialog);

    for (const [key, modifiers] of [
      ['c', { ctrlKey: true }],
      ['x', { metaKey: true }],
    ] as const) {
      const event = dispatchKey(window, key, modifiers);
      expect(event.defaultPrevented).toBe(false);
    }

    expect(copy).not.toHaveBeenCalled();
    expect(cut).not.toHaveBeenCalled();
    expect(paste).not.toHaveBeenCalled();
  });

  it('ignores repeated copy/cut shortcuts and shortcuts while disabled', () => {
    const repeated = mountShortcuts(makeLayer());
    const repeatedEvent = dispatchKey(window, 'c', { ctrlKey: true, repeat: true });
    expect(repeatedEvent.defaultPrevented).toBe(false);
    expect(repeated.copy).not.toHaveBeenCalled();

    repeated.disabled.value = true;
    for (const [key, modifiers] of [
      ['c', { ctrlKey: true }],
      ['x', { metaKey: true }],
    ] as const) {
      const event = dispatchKey(window, key, modifiers);
      expect(event.defaultPrevented).toBe(false);
    }
    expect(repeated.copy).not.toHaveBeenCalled();
    expect(repeated.cut).not.toHaveBeenCalled();
  });

  it('ignores clipboard shortcuts with Alt or Shift modifiers', () => {
    const { copy, cut, paste } = mountShortcuts(makeLayer());
    const events = [
      dispatchKey(window, 'c', { ctrlKey: true, shiftKey: true }),
      dispatchKey(window, 'x', { metaKey: true, altKey: true }),
    ];

    expect(events.every((event) => !event.defaultPrevented)).toBe(true);
    expect(copy).not.toHaveBeenCalled();
    expect(cut).not.toHaveBeenCalled();
    expect(paste).not.toHaveBeenCalled();
  });

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
