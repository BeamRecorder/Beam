import { defineComponent, h, ref } from 'vue';
import { mount } from '@vue/test-utils';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useActionShortcuts } from './useActionShortcuts';
import { hydrateActionBindings } from './action-bindings';
const wrappers: ReturnType<typeof mount>[] = [];
const setup = (run = vi.fn<() => void | Promise<unknown>>()) => {
  const disabled = ref(false),
    actionDisabled = ref(false),
    fail = vi.fn();
  let handle!: (e: KeyboardEvent) => void;
  const w = mount(
    defineComponent({
      setup() {
        handle = useActionShortcuts(
          () => [{ id: 'editor.selectAll', run, disabled: actionDisabled.value }],
          () => disabled.value,
          fail,
        ).keydown;
        return () => h('div');
      },
    }),
    { attachTo: document.body },
  );
  wrappers.push(w);
  return { w, disabled, actionDisabled, run, fail, handle };
};
const key = (init: KeyboardEventInit = {}, target: EventTarget = window) => {
  const e = new KeyboardEvent('keydown', { key: 'a', ctrlKey: true, bubbles: true, cancelable: true, ...init });
  target.dispatchEvent(e);
  return e;
};
afterEach(() => {
  for (const w of wrappers.splice(0)) w.unmount();
  document.body.replaceChildren();
  hydrateActionBindings({});
});
describe('scoped application actions', () => {
  it('executes once, follows remapping and releases its listener', () => {
    const f = setup();
    expect(key().defaultPrevented).toBe(true);
    expect(f.run).toHaveBeenCalledOnce();
    hydrateActionBindings({ 'editor.selectAll': { keys: 'Alt+J', scope: 'application', category: 'editing' } });
    expect(key().defaultPrevented).toBe(false);
    expect(key({ key: 'j', ctrlKey: false, altKey: true }).defaultPrevented).toBe(true);
    f.w.unmount();
    key({ key: 'j', ctrlKey: false, altKey: true });
    expect(f.run).toHaveBeenCalledTimes(2);
  });
  it('honors action/workspace disable, repetition, composition, cancellation and unknown keys', () => {
    const f = setup();
    for (const init of [{ repeat: true }, { isComposing: true }, { key: 'b' }])
      expect(key(init).defaultPrevented).toBe(false);
    f.disabled.value = true;
    key();
    f.disabled.value = false;
    f.actionDisabled.value = true;
    key();
    const e = new KeyboardEvent('keydown', { key: 'a', ctrlKey: true, cancelable: true });
    e.preventDefault();
    f.handle(e);
    expect(f.run).not.toHaveBeenCalled();
  });
  it('leaves text fields, focused editable elements, menus and modal dialogs alone', () => {
    const f = setup();
    for (const html of [
      '<input>',
      '<div contenteditable="true"></div>',
      '<div role="dialog" aria-modal="true"></div>',
      '<div role="menu"></div>',
    ]) {
      document.body.insertAdjacentHTML('beforeend', html);
      key({}, document.body.lastElementChild!);
      expect(f.run).not.toHaveBeenCalled();
      document.body.lastElementChild!.remove();
    }
    const input = document.createElement('input');
    document.body.append(input);
    input.focus();
    key();
    expect(f.run).not.toHaveBeenCalled();
  });
  it('surfaces synchronous and asynchronous action failures', async () => {
    const f = setup(
      vi.fn(() => {
        throw new Error('sync');
      }),
    );
    key();
    expect(f.fail).toHaveBeenCalledWith(expect.objectContaining({ message: 'sync' }));
    f.run.mockImplementation(() => Promise.reject(new Error('async')));
    key();
    await vi.waitFor(() => expect(f.fail).toHaveBeenCalledWith(expect.objectContaining({ message: 'async' })));
  });
  it('suppresses the old native paste combination when Paste is remapped or disabled', () => {
    setup();
    expect(key({ key: 'v' }).defaultPrevented).toBe(false);
    for (const keys of ['Alt+V', '']) {
      hydrateActionBindings({ 'editor.paste': { keys, scope: 'application', category: 'editing' } });
      expect(key({ key: 'v' }).defaultPrevented).toBe(true);
    }
    expect(key({ key: 'b' }).defaultPrevented).toBe(false);
  });
});

it('supports action-only registration without optional workspace or error handlers', () => {
  const run = vi.fn();
  const w = mount(
    defineComponent({
      setup() {
        useActionShortcuts(() => [{ id: 'editor.selectAll', run }]);
        return () => h('div');
      },
    }),
  );
  key();
  expect(run).toHaveBeenCalledOnce();
  w.unmount();
});
