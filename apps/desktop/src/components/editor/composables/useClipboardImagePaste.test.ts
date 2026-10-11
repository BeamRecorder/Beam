import { hydrateActionBindings } from '~/shortcuts/action-bindings';
import { defineComponent, h } from 'vue';
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { clipboardContainsImage, isEditablePasteTarget, useClipboardImagePaste } from './useClipboardImagePaste';
import { resetInternalEditorClipboardSync, syncInternalEditorClipboard } from './internal-editor-clipboard';

const clipboardItem = (kind: string, type: string) => ({ kind, type });

const pasteEvent = (target: EventTarget | null, items: Array<{ kind: string; type: string }>) =>
  ({
    target,
    defaultPrevented: false,
    clipboardData: { items },
    preventDefault: vi.fn(),
  }) as unknown as ClipboardEvent;

let wrapper: VueWrapper | undefined;

const mountPaste = (disabled = false, preferInternal = false) => {
  let state!: ReturnType<typeof useClipboardImagePaste>;
  const paste = vi.fn().mockResolvedValue(undefined);
  const onError = vi.fn();
  const Harness = defineComponent({
    setup() {
      state = useClipboardImagePaste({
        disabled: () => disabled,
        preferInternal: () => preferInternal,
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
  resetInternalEditorClipboardSync();
  hydrateActionBindings({});
  vi.unstubAllGlobals();
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

  it('leaves a stale native image for a fresh internal editor copy', async () => {
    syncInternalEditorClipboard('Rectangle');
    const { state, paste } = mountPaste(false, true);
    const event = pasteEvent(document.body, [clipboardItem('file', 'image/png')]);

    state.handlePaste(event);
    await flushPromises();

    expect(event.preventDefault).not.toHaveBeenCalled();
    expect(paste).not.toHaveBeenCalled();
  });

  it('imports a newer native image after the internal clipboard was synchronized', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal('navigator', { clipboard: { writeText } });
    syncInternalEditorClipboard('Rectangle');
    await flushPromises();
    const { state, paste } = mountPaste(false, true);
    const event = pasteEvent(document.body, [clipboardItem('file', 'image/png')]);

    state.handlePaste(event);
    await flushPromises();

    expect(event.preventDefault).toHaveBeenCalledOnce();
    expect(paste).toHaveBeenCalledOnce();
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

describe('custom image paste shortcut', () => {
  const press = (key: string, target: EventTarget = window) => {
    const event = new KeyboardEvent('keydown', { key, ctrlKey: true, bubbles: true, cancelable: true });
    target.dispatchEvent(event);
    return event;
  };
  const remap = () =>
    hydrateActionBindings({ 'editor.paste': { keys: 'Ctrl+K', scope: 'application', category: 'editing' } });
  it('uses the configured binding and blocks the previous paste accelerator', async () => {
    remap();
    const { paste } = mountPaste();
    expect(press('v').defaultPrevented).toBe(true);
    expect(paste).not.toHaveBeenCalled();
    expect(press('k').defaultPrevented).toBe(true);
    await flushPromises();
    expect(paste).toHaveBeenCalledOnce();
  });
  it('leaves the custom binding to the internal clipboard and protects editable fields', async () => {
    remap();
    const { paste } = mountPaste(false, true);
    expect(press('k').defaultPrevented).toBe(false);
    const input = document.createElement('input');
    document.body.append(input);
    expect(press('k', input).defaultPrevented).toBe(false);
    input.remove();
    await flushPromises();
    expect(paste).not.toHaveBeenCalled();
  });
  it('honors disabled editors and reports image read failures', async () => {
    remap();
    const disabled = mountPaste(true);
    expect(press('k').defaultPrevented).toBe(false);
    expect(disabled.paste).not.toHaveBeenCalled();
    wrapper?.unmount();
    const active = mountPaste();
    active.paste.mockRejectedValueOnce(new Error('clipboard unavailable'));
    press('k');
    await flushPromises();
    expect(active.onError).toHaveBeenCalledWith(expect.objectContaining({ message: 'clipboard unavailable' }));
  });
});
