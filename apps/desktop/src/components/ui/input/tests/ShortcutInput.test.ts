import { enableAutoUnmount, flushPromises, mount } from '@vue/test-utils';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import ShortcutInput from '../ShortcutInput.vue';
const capture = vi.hoisted(() => ({ setShortcutCaptureActive: vi.fn() }));
vi.mock('~/api/capture', () => ({ capture }));
enableAutoUnmount(afterEach);
afterEach(() => vi.unstubAllGlobals());
beforeEach(() => {
  vi.clearAllMocks();
  capture.setShortcutCaptureActive.mockResolvedValue(undefined);
});
const create = (props: Partial<InstanceType<typeof ShortcutInput>['$props']> = {}) =>
  mount(ShortcutInput, { props: { modelValue: 'Ctrl+K', label: 'Copy selection', ...props }, attachTo: document.body });
const start = async (wrapper: ReturnType<typeof create>) => {
  await wrapper.get('button').trigger('click');
  await flushPromises();
};
describe('shortcut capture field', () => {
  it('waits for global shortcut suspension before recording and releases it after saving', async () => {
    let ready!: () => void;
    capture.setShortcutCaptureActive.mockImplementationOnce(() => new Promise<void>((resolve) => (ready = resolve)));
    const wrapper = create();
    await wrapper.get('button').trigger('click');
    expect(wrapper.get('button').attributes('aria-pressed')).toBe('false');
    ready();
    await flushPromises();
    expect(wrapper.get('button').attributes('aria-pressed')).toBe('true');
    await wrapper.get('button').trigger('keydown', { key: 'k', code: 'KeyK', ctrlKey: true, shiftKey: true });
    await flushPromises();
    expect(wrapper.emitted('update:modelValue')).toEqual([['Ctrl+Shift+K']]);
    expect(capture.setShortcutCaptureActive).toHaveBeenLastCalledWith(false);
  });
  it.each([
    [' ', 'Space'],
    ['ArrowUp', 'Up'],
    ['ArrowDown', 'Down'],
    ['ArrowLeft', 'Left'],
    ['ArrowRight', 'Right'],
    ['F12', 'F12'],
    ['Enter', 'Enter'],
    ['+', 'Plus'],
  ])('records %s as %s', async (key, expected) => {
    const wrapper = create();
    await start(wrapper);
    await wrapper.get('button').trigger('keydown', { key });
    expect(wrapper.emitted('change')).toEqual([[expected]]);
  });
  it('records a modifier gesture when all held keys are released', async () => {
    const wrapper = create({ kind: 'modifier' });
    await start(wrapper);
    await wrapper.get('button').trigger('keydown', { key: 'Control', ctrlKey: true });
    await wrapper.get('button').trigger('keydown', { key: 'Alt', ctrlKey: true, altKey: true });
    await wrapper.get('button').trigger('keyup', { key: 'Alt', ctrlKey: true });
    expect(wrapper.emitted('change')).toBeUndefined();
    await wrapper.get('button').trigger('keyup', { key: 'Control' });
    expect(wrapper.emitted('change')).toEqual([['Ctrl+Alt']]);
  });
  it('cancels on Escape, Tab, blur and unmount without changing the saved value', async () => {
    const wrapper = create();
    for (const key of ['Escape', 'Tab']) {
      await start(wrapper);
      await wrapper.get('button').trigger('keydown', { key });
      expect(wrapper.get('button').attributes('aria-pressed')).toBe('false');
    }
    await start(wrapper);
    await wrapper.get('button').trigger('blur');
    expect(wrapper.emitted('change')).toBeUndefined();
    await start(wrapper);
    wrapper.unmount();
    expect(capture.setShortcutCaptureActive).toHaveBeenLastCalledWith(false);
  });
  it('does not reenter recording after a delayed suspension finishes following blur', async () => {
    let ready!: () => void;
    capture.setShortcutCaptureActive.mockImplementationOnce(() => new Promise<void>((resolve) => (ready = resolve)));
    const wrapper = create();
    await wrapper.get('button').trigger('click');
    await wrapper.get('button').trigger('blur');
    ready();
    await flushPromises();
    expect(wrapper.get('button').attributes('aria-pressed')).toBe('false');
  });
  it('clears with Backspace or Delete, supports keyboard activation and also resets from a context menu', async () => {
    const wrapper = create({ customized: true });
    await wrapper.get('button').trigger('keydown', { key: 'Backspace' });
    expect(wrapper.emitted('change')).toEqual([['']]);
    await wrapper.get('button').trigger('keydown', { key: 'Enter' });
    await flushPromises();
    await wrapper.get('button').trigger('keydown', { key: 'Delete' });
    expect(wrapper.emitted('change')).toEqual([[''], ['']]);
    await wrapper.get('button').trigger('keydown', { key: 'F10', shiftKey: true });
    await flushPromises();
    const reset = [...document.querySelectorAll<HTMLButtonElement>('[role="menuitem"]')].find((item) =>
      item.textContent?.includes('Restore default'),
    )!;
    expect(reset).toBeTruthy();
    reset.click();
    await flushPromises();
    expect(wrapper.emitted('reset')).toHaveLength(1);
    expect(wrapper.findAll('button')).toHaveLength(2);
  });
  it('uses the mouse context menu to clear without extra permanent controls', async () => {
    const wrapper = create();
    await wrapper.get('button').trigger('contextmenu', { clientX: 40, clientY: 40 });
    await flushPromises();
    const clear = [...document.querySelectorAll<HTMLButtonElement>('[role="menuitem"]')].find((item) =>
      item.textContent?.includes('Clear shortcut'),
    )!;
    clear.click();
    await flushPromises();
    expect(wrapper.emitted('change')).toEqual([['']]);
  });
  it('leaves unavailable controls inert and displays errors accessibly', async () => {
    const wrapper = create({ disabled: true, error: 'Could not save' });
    expect(wrapper.get('button').attributes('disabled')).toBeDefined();
    await wrapper.get('button').trigger('keydown', { key: 'Enter' });
    await wrapper.get('button').trigger('contextmenu');
    expect(capture.setShortcutCaptureActive).not.toHaveBeenCalled();
    expect(wrapper.get('[role=alert]').text()).toBe('Could not save');
    expect(wrapper.get('button').attributes('aria-invalid')).toBe('true');
  });
  it('reports native capture failure and an unavailable restoration', async () => {
    capture.setShortcutCaptureActive.mockRejectedValueOnce(new Error('Unavailable'));
    const wrapper = create({ modelValue: '' });
    await start(wrapper);
    expect(wrapper.get('[role=alert]').text()).toContain('Unavailable');
    expect(wrapper.get('button').attributes('aria-pressed')).toBe('false');
    await start(wrapper);
    capture.setShortcutCaptureActive.mockRejectedValueOnce(new Error('Restore failed'));
    await wrapper.get('button').trigger('blur');
    await flushPromises();
    expect(wrapper.get('[role=alert]').text()).toContain('Restore failed');
  });
  it('cancels key capture when the native Settings window loses focus', async () => {
    const wrapper = create();
    await start(wrapper);
    window.dispatchEvent(new Event('blur'));
    await flushPromises();
    expect(wrapper.get('button').attributes('aria-pressed')).toBe('false');
    expect(capture.setShortcutCaptureActive).toHaveBeenLastCalledWith(false);
  });
});

describe('visible restore-default action', () => {
  it('appears only for modified bindings and disappears after restoring their default', async () => {
    const wrapper = create();
    expect(wrapper.find('[aria-label="Restore default"]').exists()).toBe(false);
    await wrapper.setProps({ customized: true });
    await wrapper.get('[aria-label="Restore default"]').trigger('click');
    await flushPromises();
    expect(wrapper.emitted('reset')).toHaveLength(1);
    expect(wrapper.emitted('change')).toBeUndefined();
    await wrapper.setProps({ customized: false });
    expect(wrapper.find('[aria-label="Restore default"]').exists()).toBe(false);
  });
  it('keeps an unassigned modified binding restorable and disables reset while saving', async () => {
    const wrapper = create({ modelValue: '', customized: true, disabled: true });
    expect(wrapper.get('[aria-label="Restore default"]').attributes('disabled')).toBeDefined();
    await wrapper.get('[aria-label="Restore default"]').trigger('click');
    expect(wrapper.emitted('reset')).toBeUndefined();
    await wrapper.setProps({ disabled: false });
    await wrapper.get('[aria-label="Restore default"]').trigger('click');
    await flushPromises();
    expect(wrapper.emitted('reset')).toHaveLength(1);
  });
  it('waits for native restoration already started by blur before publishing a reset', async () => {
    const wrapper = create({ customized: true });
    await start(wrapper);
    let restore!: () => void;
    capture.setShortcutCaptureActive.mockImplementationOnce(() => new Promise<void>((resolve) => (restore = resolve)));
    await wrapper.get('.shortcut-trigger button').trigger('blur');
    await wrapper.get('[aria-label="Restore default"]').trigger('click');
    expect(wrapper.emitted('reset')).toBeUndefined();
    restore();
    await flushPromises();
    expect(wrapper.emitted('reset')).toHaveLength(1);
    expect(capture.setShortcutCaptureActive).toHaveBeenCalledTimes(2);
  });
  it('leaves the saved shortcut intact if native restoration fails during reset', async () => {
    const wrapper = create({ customized: true });
    await start(wrapper);
    capture.setShortcutCaptureActive.mockRejectedValueOnce(new Error('Cannot restore native shortcuts'));
    await wrapper.get('[aria-label="Restore default"]').trigger('click');
    await flushPromises();
    expect(wrapper.emitted('reset')).toBeUndefined();
    expect(wrapper.get('[role=alert]').text()).toContain('Cannot restore native shortcuts');
  });
  it('waits for the previous capture to finish restoring before starting another', async () => {
    const wrapper = create({ customized: true });
    await start(wrapper);
    let restore!: () => void;
    capture.setShortcutCaptureActive.mockImplementationOnce(() => new Promise<void>((resolve) => (restore = resolve)));
    await wrapper.get('.shortcut-trigger button').trigger('blur');
    await start(wrapper);
    expect(capture.setShortcutCaptureActive).toHaveBeenCalledTimes(2);
    expect(wrapper.get('.shortcut-trigger button').attributes('aria-pressed')).toBe('false');
    restore();
    await flushPromises();
    await start(wrapper);
    expect(capture.setShortcutCaptureActive).toHaveBeenCalledTimes(3);
    expect(wrapper.get('.shortcut-trigger button').attributes('aria-pressed')).toBe('true');
  });
});

it('restores native shortcut registration before publishing a changed binding', async () => {
  const wrapper = create();
  await start(wrapper);
  let restore!: () => void;
  capture.setShortcutCaptureActive.mockImplementationOnce(
    () =>
      new Promise<void>((done) => {
        restore = done;
      }),
  );
  await wrapper.get('button').trigger('keydown', { key: 'r', altKey: true, shiftKey: true });
  expect(wrapper.emitted('change')).toBeUndefined();
  restore();
  await flushPromises();
  expect(wrapper.emitted('change')).toEqual([['Alt+Shift+R']]);
});
it('does not persist a binding if native shortcut restoration fails', async () => {
  const wrapper = create();
  await start(wrapper);
  capture.setShortcutCaptureActive.mockRejectedValueOnce(new Error('Native keys unavailable'));
  await wrapper.get('button').trigger('keydown', { key: 'r', altKey: true });
  await flushPromises();
  expect(wrapper.emitted('change')).toBeUndefined();
  expect(wrapper.get('[role=alert]').text()).toContain('Native keys unavailable');
});

it.each([
  ['MacIntel', { key: 'k', ctrlKey: true }, 'Control+K'],
  ['MacIntel', { key: 'k', metaKey: true }, 'Command+K'],
  ['Win32', { key: 'k', metaKey: true }, 'Super+K'],
  ['Win32', { key: 'ф', code: 'KeyA', ctrlKey: true }, 'Ctrl+A'],
])('records physical and platform modifiers on %s', async (platform, keys, expected) => {
  vi.stubGlobal('navigator', { platform });
  const wrapper = create();
  await start(wrapper);
  await wrapper.get('button').trigger('keydown', keys);
  await flushPromises();
  expect(wrapper.emitted('change')).toEqual([[expected]]);
});
it('ignores idle keys and prevents repeated native capture requests', async () => {
  const wrapper = create();
  await wrapper.get('button').trigger('keydown', { key: 'k' });
  expect(wrapper.emitted('change')).toBeUndefined();
  await start(wrapper);
  await wrapper.get('button').trigger('click');
  expect(capture.setShortcutCaptureActive).toHaveBeenCalledTimes(1);
});
