import { mount, flushPromises } from '@vue/test-utils';
import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import HudResizeHandles from '../HudResizeHandles.vue';

const resizeHud = vi.hoisted(() => vi.fn());
vi.mock('~/api/capture', () => ({ capture: { resizeHud, setInteractive: vi.fn() } }));

beforeEach(() => {
  resizeHud.mockReset().mockResolvedValue({ width: 800, height: 400 });
  vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
    callback(0);
    return 1;
  });
  vi.stubGlobal('cancelAnimationFrame', vi.fn());
});
afterEach(() => vi.unstubAllGlobals());

describe('HUD edge resizing', () => {
  it('reads the chosen base size and exposes all eight handles', async () => {
    const wrapper = mount(HudResizeHandles);
    await flushPromises();
    expect(wrapper.findAll('.hud-resize-edge')).toHaveLength(8);
    expect(resizeHud).toHaveBeenCalledWith(null, 'read');
    expect(wrapper.emitted('resize')?.[0]).toEqual([{ width: 800, height: 400 }]);
    wrapper.unmount();
  });

  it('captures the pointer, resizes and ends the gesture on focus loss', async () => {
    const wrapper = mount(HudResizeHandles);
    const edge = wrapper.get('.se');
    const element = edge.element as HTMLElement;
    element.setPointerCapture = vi.fn();
    element.hasPointerCapture = vi.fn().mockReturnValue(true);
    element.releasePointerCapture = vi.fn();
    const down = new MouseEvent('pointerdown', { button: 0, bubbles: true });
    Object.defineProperty(down, 'pointerId', { value: 7 });
    element.dispatchEvent(down);
    const move = new MouseEvent('pointermove', { bubbles: true });
    Object.defineProperty(move, 'pointerId', { value: 7 });
    element.dispatchEvent(move);
    window.dispatchEvent(new Event('blur'));
    await flushPromises();
    expect(element.setPointerCapture).toHaveBeenCalledWith(7);
    expect(element.releasePointerCapture).toHaveBeenCalledWith(7);
    expect(resizeHud.mock.calls).toContainEqual(['se', 'start']);
    expect(resizeHud.mock.calls).toContainEqual([null, 'move']);
    expect(resizeHud.mock.calls.at(-1)).toEqual([null, 'end']);
    wrapper.unmount();
  });

  it('ignores secondary buttons and reports failures without publishing fake sizes', async () => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => {});
    resizeHud.mockRejectedValueOnce(new Error('unavailable'));
    const wrapper = mount(HudResizeHandles);
    wrapper.get('.n').element.dispatchEvent(new MouseEvent('pointerdown', { button: 2, bubbles: true }));
    await flushPromises();
    expect(resizeHud).toHaveBeenCalledTimes(1);
    expect(wrapper.emitted('resize')).toBeUndefined();
    expect(log).toHaveBeenCalled();
    wrapper.unmount();
    log.mockRestore();
  });
  it('coalesces moves, ignores other pointers and stops on pointer cancellation', async () => {
    let scheduled: FrameRequestCallback | null = null;
    vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
      scheduled = callback;
      return 42;
    });
    const wrapper = mount(HudResizeHandles);
    const element = wrapper.get('.e').element as HTMLElement;
    element.setPointerCapture = vi.fn();
    element.hasPointerCapture = vi.fn().mockReturnValue(false);
    const send = (type: string, pointerId: number) => {
      const event = new MouseEvent(type, { button: 0, bubbles: true });
      Object.defineProperty(event, 'pointerId', { value: pointerId });
      element.dispatchEvent(event);
    };
    send('pointerup', 1);
    send('pointermove', 2);
    send('pointerdown', 1);
    send('pointerdown', 1);
    send('pointermove', 2);
    send('pointermove', 1);
    send('pointermove', 1);
    expect(scheduled).not.toBeNull();
    send('pointercancel', 1);
    await flushPromises();
    expect(cancelAnimationFrame).toHaveBeenCalledWith(42);
    expect(resizeHud.mock.calls.filter((call) => call[1] === 'start')).toHaveLength(1);
    expect(resizeHud.mock.calls.at(-1)).toEqual([null, 'end']);
    wrapper.unmount();
  });

  it('does not publish absent sizes or late results after disposal', async () => {
    resizeHud.mockResolvedValueOnce(null);
    const first = mount(HudResizeHandles);
    await flushPromises();
    expect(first.emitted('resize')).toBeUndefined();
    first.unmount();
    const late = mount(HudResizeHandles);
    late.unmount();
    await flushPromises();
    expect(late.emitted('resize')).toBeUndefined();
  });
});
