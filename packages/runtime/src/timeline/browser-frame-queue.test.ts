import { afterEach, expect, it, vi } from 'vitest';
import { createBrowserTimelineFrameQueue } from './browser-frame-queue';
afterEach(() => vi.restoreAllMocks());
it('binds the native request method to Window and executes coalesced work', () => {
  let callback!: FrameRequestCallback;
  vi.spyOn(window, 'requestAnimationFrame').mockImplementation(function (this: Window, frame) {
    expect(this).toBe(window);
    callback = frame;
    return 1;
  });
  const queue = createBrowserTimelineFrameQueue(),
    completed = vi.fn();
  queue.request('paint', completed);
  callback(42);
  expect(completed).toHaveBeenCalledWith(42);
  queue.dispose();
});
it('binds cancellation to Window and cancels the pending native frame', () => {
  vi.spyOn(window, 'requestAnimationFrame').mockReturnValue(7);
  const cancel = vi.spyOn(window, 'cancelAnimationFrame').mockImplementation(function (this: Window, id) {
    expect(this).toBe(window);
    expect(id).toBe(7);
  });
  const queue = createBrowserTimelineFrameQueue(),
    id = queue.request('paint', () => {});
  queue.cancel(id);
  expect(cancel).toHaveBeenCalledOnce();
  queue.dispose();
});
it('releases pending work on disposal and refuses subsequent scheduling', () => {
  const request = vi.spyOn(window, 'requestAnimationFrame').mockReturnValue(4);
  const cancel = vi.spyOn(window, 'cancelAnimationFrame').mockImplementation(() => {});
  const queue = createBrowserTimelineFrameQueue();
  queue.request('measure', () => {});
  queue.dispose();
  queue.dispose();
  expect(cancel).toHaveBeenCalledOnce();
  expect(() => queue.request('paint', () => {})).toThrow('disposed');
  expect(request).toHaveBeenCalledOnce();
});
