import { defineComponent, h } from 'vue';
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { clipboardContainsImage, isEditablePasteTarget, useClipboardImagePaste } from './useClipboardImagePaste';

const clipboardItem = (kind: string, type: string) => ({ kind, type });

const pasteEvent = (target: EventTarget | null, items: Array<{ kind: string; type: string }>) =>
  ({
    target,
    defaultPrevented: false,
    clipboardData: { items },
    preventDefault: vi.fn(),
  }) as unknown as ClipboardEvent;

let wrapper: VueWrapper | undefined;

const mountPaste = (disabled = false) => {
  let state!: ReturnType<typeof useClipboardImagePaste>;
  const paste = vi.fn().mockResolvedValue(undefined);
  const onError = vi.fn();
  const Harness = defineComponent({
    setup() {
      state = useClipboardImagePaste({
        disabled: () => disabled,
        paste,
        onError,
      });
      return () => h('div');
    },
  });
  wrapper = mount(Harness);
  return { state, paste, onError };
};

afterEach(() => {
  wrapper?.unmount();
  wrapper = undefined;
});

describe('clipboard image paste detection', () => {
  it('recognizes image files but ignores text clipboard items', () => {
    expect(clipboardContainsImage(pasteEvent(document.body, [clipboardItem('file', 'image/png')]))).toBe(true);
    expect(clipboardContainsImage(pasteEvent(document.body, [clipboardItem('string', 'image/png')]))).toBe(false);
    expect(clipboardContainsImage(pasteEvent(document.body, [clipboardItem('file', 'text/plain')]))).toBe(false);
    expect(clipboardContainsImage(pasteEvent(document.body, []))).toBe(false);
  });

  it('identifies editable paste targets and leaves contenteditable=false available to the editor', () => {
    const input = document.createElement('input');
    const textarea = document.createElement('textarea');
    const select = document.createElement('select');
    const contenteditable = document.createElement('div');
    contenteditable.setAttribute('contenteditable', 'true');
    const textbox = document.createElement('div');
    textbox.setAttribute('role', 'textbox');
    const inert = document.createElement('div');
    inert.setAttribute('contenteditable', 'false');

    expect([input, textarea, select, contenteditable, textbox].every(isEditablePasteTarget)).toBe(true);
    expect(isEditablePasteTarget(inert)).toBe(false);
    expect(isEditablePasteTarget(null)).toBe(false);
  });
});

describe('useClipboardImagePaste', () => {
  it('pastes an image from a non-editable target and prevents the browser default', async () => {
    const { state, paste, onError } = mountPaste();
    const event = pasteEvent(document.body, [clipboardItem('file', 'image/png')]);

    state.handlePaste(event);
    await flushPromises();

    expect(event.preventDefault).toHaveBeenCalledOnce();
    expect(paste).toHaveBeenCalledOnce();
    expect(onError).not.toHaveBeenCalled();
  });

  it.each([
    ['input', () => document.createElement('input')],
    ['textarea', () => document.createElement('textarea')],
    [
      'contenteditable',
      () => {
        const element = document.createElement('div');
        element.setAttribute('contenteditable', 'true');
        return element;
      },
    ],
    [
      'textbox',
      () => {
        const element = document.createElement('div');
        element.setAttribute('role', 'textbox');
        return element;
      },
    ],
  ])('ignores an image paste targeted at an editable %s', async (_label, createTarget) => {
    const { state, paste, onError } = mountPaste();
    const event = pasteEvent(createTarget(), [clipboardItem('file', 'image/png')]);

    state.handlePaste(event);
    await flushPromises();

    expect(event.preventDefault).not.toHaveBeenCalled();
    expect(paste).not.toHaveBeenCalled();
    expect(onError).not.toHaveBeenCalled();
  });

  it('ignores non-image paste data and disabled editors', async () => {
    const active = mountPaste();
    const textEvent = pasteEvent(document.body, [clipboardItem('string', 'text/plain')]);
    active.state.handlePaste(textEvent);
    await flushPromises();
    expect(active.paste).not.toHaveBeenCalled();
    expect(textEvent.preventDefault).not.toHaveBeenCalled();

    wrapper?.unmount();
    wrapper = undefined;
    const disabled = mountPaste(true);
    const imageEvent = pasteEvent(document.body, [clipboardItem('file', 'image/png')]);
    disabled.state.handlePaste(imageEvent);
    await flushPromises();
    expect(disabled.paste).not.toHaveBeenCalled();
    expect(imageEvent.preventDefault).not.toHaveBeenCalled();
  });
});
