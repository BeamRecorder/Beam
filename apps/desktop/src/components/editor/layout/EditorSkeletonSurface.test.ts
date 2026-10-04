import { enableAutoUnmount, flushPromises, mount } from '@vue/test-utils';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import EditorSkeletonSurface from './EditorSkeletonSurface.vue';
enableAutoUnmount(afterEach);
let resize: ResizeObserverCallback;
let frame: FrameRequestCallback;
const disconnect = vi.fn();
const cancel = vi.fn();
const request = vi.fn((callback: FrameRequestCallback) => {
  frame = callback;
  return 7;
});
beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal('requestAnimationFrame', request);
  vi.stubGlobal('cancelAnimationFrame', cancel);
  vi.stubGlobal(
    'ResizeObserver',
    class {
      constructor(callback: ResizeObserverCallback) {
        resize = callback;
      }
      observe = vi.fn();
      disconnect = disconnect;
    },
  );
  vi.spyOn(HTMLElement.prototype, 'offsetWidth', 'get').mockReturnValue(200);
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue(new DOMRect(10, 20, 200, 100));
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});
const create = () => mount(EditorSkeletonSurface, { slots: { default: '<button>Source control</button>' } });
it('uses actual, inert source controls and produces matching accessible-hidden shapes immediately', async () => {
  const wrapper = create();
  await flushPromises();
  expect(wrapper.get('.editor-skeleton-surface').attributes('inert')).toBeDefined();
  expect(wrapper.get('.editor-skeleton-surface').attributes('aria-hidden')).toBe('true');
  expect(wrapper.get('.skeleton-shape').attributes('style')).toContain('width: 200px');
  expect(request).not.toHaveBeenCalled();
});
it('coalesces repeated resize and DOM changes into one measured frame', async () => {
  const wrapper = create();
  resize([], {} as ResizeObserver);
  resize([], {} as ResizeObserver);
  wrapper.get('button').element.setAttribute('data-updated', 'true');
  await flushPromises();
  expect(request).toHaveBeenCalledOnce();
  frame(0);
  await flushPromises();
  resize([], {} as ResizeObserver);
  expect(request).toHaveBeenCalledTimes(2);
});
it('reconciles a changed disclosure without guessing fields or polling when idle', async () => {
  const wrapper = create();
  wrapper.get('.skeleton-source').element.insertAdjacentHTML('beforeend', '<input aria-label="Added field">');
  await flushPromises();
  frame(0);
  await flushPromises();
  expect(wrapper.findAll('.skeleton-shape')).toHaveLength(2);
  expect(request).toHaveBeenCalledOnce();
});
it('releases both observers and a queued frame, including a late callback after unmount', async () => {
  const wrapper = create();
  resize([], {} as ResizeObserver);
  wrapper.unmount();
  expect(disconnect).toHaveBeenCalledOnce();
  expect(cancel).toHaveBeenCalledWith(7);
  resize([], {} as ResizeObserver);
  expect(request).toHaveBeenCalledOnce();
  frame(0);
  await flushPromises();
  expect(wrapper.findAll('.skeleton-shape')).toHaveLength(0);
});
