import { defineComponent } from 'vue';
import { flushPromises, mount } from '@vue/test-utils';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
const capture = vi.hoisted(() => ({ platform: 'win32', resizeHudPopover: vi.fn().mockResolvedValue(268) }));
vi.mock('~/api/capture', () => ({ capture }));
import { useHudPopoverViewport } from '../useHudPopoverViewport';
let wrapper: ReturnType<typeof mount> | undefined;
function create(embedded = false) {
  let state!: ReturnType<typeof useHudPopoverViewport>;
  wrapper = mount(
    defineComponent({
      setup() {
        state = useHudPopoverViewport(embedded);
        return () => null;
      },
    }),
  );
  return state;
}
beforeEach(() => {
  capture.platform = 'win32';
  capture.resizeHudPopover.mockReset().mockResolvedValue(268);
});
afterEach(() => {
  wrapper?.unmount();
  wrapper = undefined;
});
describe('HUD popover viewport', () => {
  it('expands to actual menu height and restores the compact window after close', async () => {
    const state = create();
    await state.update('menu', 400);
    expect(capture.resizeHudPopover).toHaveBeenLastCalledWith(416);
    await state.update('menu', 400);
    expect(capture.resizeHudPopover).toHaveBeenCalledTimes(1);
    await state.update('menu', null);
    expect(capture.resizeHudPopover).toHaveBeenLastCalledWith(268);
    await state.update('small', 100);
    expect(capture.resizeHudPopover).toHaveBeenCalledTimes(2);
  });
  it('keeps enough space for nested menus and coalesces rapid close/open requests', async () => {
    const state = create();
    await state.update('parent', 350);
    await state.update('child', 500);
    await state.update('child', null);
    expect(capture.resizeHudPopover).toHaveBeenLastCalledWith(366);
    const closing = state.update('parent', null);
    const opening = state.update('replacement', 420);
    await Promise.all([closing, opening]);
    expect(capture.resizeHudPopover.mock.calls.slice(-1)).toEqual([[436]]);
  });
  it('does not resize embedded HUDs or accept requests after teardown', async () => {
    const embedded = create(true);
    await embedded.update('menu', 500);
    wrapper?.unmount();
    await flushPromises();
    expect(capture.resizeHudPopover).not.toHaveBeenCalled();
    const state = create();
    await state.update('menu', 450);
    wrapper?.unmount();
    wrapper = undefined;
    await state.update('late', 600);
    await flushPromises();
    expect(capture.resizeHudPopover.mock.calls).toEqual([[466], [268]]);
  });
  it('reports native failures, retries and clears the error after recovery', async () => {
    const state = create();
    capture.resizeHudPopover.mockRejectedValueOnce(new Error('Resize failed'));
    await state.update('menu', 400);
    expect(state.error.value).toBe('Resize failed');
    await state.update('menu', 400);
    expect(state.error.value).toBe('');
    capture.resizeHudPopover.mockRejectedValueOnce('Native window unavailable');
    await state.update('menu', 500);
    expect(state.error.value).toBe('Native window unavailable');
  });
  it('restores bounds after an in-flight expansion during teardown and reports cleanup failure', async () => {
    const state = create();
    let resolve!: (value: number) => void;
    capture.resizeHudPopover.mockReturnValueOnce(
      new Promise<number>((r) => {
        resolve = r;
      }),
    );
    const request = state.update('menu', 400);
    await flushPromises();
    wrapper?.unmount();
    wrapper = undefined;
    const log = vi.spyOn(console, 'error').mockImplementation(() => {});
    capture.resizeHudPopover.mockRejectedValueOnce(new Error('Window destroyed'));
    resolve(416);
    await request;
    await flushPromises();
    expect(log).toHaveBeenCalledWith('Failed to restore HUD popover bounds:', expect.any(Error));
    log.mockRestore();
  });
});

describe('Linux compact bounds', () => {
  it('never expands or restores a Linux window for CSS menus', async () => {
    capture.platform = 'linux';
    const state = create();
    await state.update('menu', 500);
    await state.update('menu', null);
    wrapper?.unmount();
    wrapper = undefined;
    await flushPromises();
    expect(capture.resizeHudPopover).not.toHaveBeenCalled();
  });
});
