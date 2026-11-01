import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { defineComponent, h, nextTick, ref } from 'vue';
import { mount, enableAutoUnmount } from '@vue/test-utils';
import { useCropHudPosition } from '../useCropHudPosition';

enableAutoUnmount(afterEach);
beforeEach(() => vi.useFakeTimers());
afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});
const create = async (rect = new DOMRect(200, 100, 100, 100)) => {
  const done = vi.fn();
  let schedule!: () => void;
  const wrapper = mount(
    defineComponent({
      setup() {
        const anchor = ref<HTMLElement | null>(null),
          hud = ref<HTMLElement | null>(null),
          position = useCropHudPosition(anchor, hud);
        schedule = position.scheduleHudPosition;
        return () =>
          h('div', { class: 'stage-bounds' }, [
            h('div', { ref: anchor, class: 'anchor' }),
            h('div', { ref: hud, class: 'crop-hud', style: position.hudStyle.value }, [
              h('button', { class: 'crop-ok-button', onClick: done }, 'OK'),
            ]),
          ]);
      },
    }),
    { attachTo: document.body },
  );
  vi.spyOn(wrapper.element, 'getBoundingClientRect').mockReturnValue(new DOMRect(20, 40, 600, 400));
  vi.spyOn(wrapper.get('.anchor').element, 'getBoundingClientRect').mockImplementation(() => rect);
  vi.spyOn(wrapper.get('.crop-hud').element, 'getBoundingClientRect').mockReturnValue(new DOMRect(0, 0, 200, 40));
  await nextTick();
  schedule();
  vi.advanceTimersByTime(32);
  await nextTick();
  return { wrapper, done, schedule };
};
it.each([new DOMRect(-5000, -5000, 100, 100), new DOMRect(5000, 5000, 100, 100), new DOMRect(200, 400, 100, 100)])(
  'keeps OK within the untransformed editor viewport for offscreen crops %o',
  async (rect) => {
    const { wrapper } = await create(rect),
      style = (wrapper.get('.crop-hud').element as HTMLElement).style;
    expect(Number.parseFloat(style.left)).toBeGreaterThanOrEqual(20);
    expect(Number.parseFloat(style.left)).toBeLessThanOrEqual(420);
    expect(Number.parseFloat(style.top)).toBeGreaterThanOrEqual(40);
    expect(Number.parseFloat(style.top)).toBeLessThanOrEqual(400);
    expect(style.visibility).toBe('visible');
  },
);
it('repositions after ancestor transforms, coalesces frames and stops observing after disposal', async () => {
  const rect = new DOMRect(200, 100, 100, 100),
    { wrapper, schedule } = await create(rect);
  rect.x = 5000;
  (wrapper.element as HTMLElement).style.transform = 'translateX(50px)';
  await nextTick();
  await Promise.resolve();
  vi.advanceTimersByTime(32);
  await nextTick();
  expect((wrapper.get('.crop-hud').element as HTMLElement).style.left).toBe('420px');
  schedule();
  schedule();
  wrapper.unmount();
  schedule();
  vi.advanceTimersByTime(100);
  expect(document.querySelector('.crop-hud')).toBeNull();
});
it('confirms with Enter outside controls and leaves text inputs and menu actions alone', async () => {
  const { wrapper, done } = await create();
  window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' }));
  expect(done).toHaveBeenCalledTimes(1);
  const input = document.createElement('input');
  wrapper.element.appendChild(input);
  input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
  input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
  const prevented = new KeyboardEvent('keydown', { key: 'Enter', cancelable: true });
  prevented.preventDefault();
  window.dispatchEvent(prevented);
  expect(done).toHaveBeenCalledTimes(1);
});
it('observes the viewport as well as the crop and HUD, then disconnects on unmount', async () => {
  const observe = vi.fn(),
    disconnect = vi.fn();
  let notify!: () => void;
  vi.stubGlobal(
    'ResizeObserver',
    class {
      constructor(callback: () => void) {
        notify = callback;
      }
      observe = observe;
      disconnect = disconnect;
    },
  );
  const { wrapper } = await create();
  expect(observe.mock.calls.map(([element]) => element.className)).toEqual(['anchor', 'crop-hud', 'stage-bounds']);
  notify();
  vi.advanceTimersByTime(32);
  await nextTick();
  expect((wrapper.get('.crop-hud').element as HTMLElement).style.visibility).toBe('visible');
  wrapper.unmount();
  expect(disconnect).toHaveBeenCalledOnce();
});
it('stays hidden without mounted elements and ignores deferred setup after early unmount', async () => {
  const createEmpty = () =>
    mount(
      defineComponent({
        setup() {
          useCropHudPosition(ref(null), ref(null));
          return () => h('div');
        },
      }),
    );
  const wrapper = createEmpty();
  await nextTick();
  vi.advanceTimersByTime(32);
  await nextTick();
  window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' }));
  wrapper.unmount();
  createEmpty().unmount();
  await nextTick();
  vi.advanceTimersByTime(32);
  expect(document.querySelector('.crop-hud')).toBeNull();
});
it('uses window bounds without an editor container and handles missing observer targets', async () => {
  const { wrapper, schedule } = await create(new DOMRect(10, 10, 100, 100));
  wrapper.element.classList.remove('stage-bounds');
  schedule();
  vi.advanceTimersByTime(32);
  await nextTick();
  expect((wrapper.get('.crop-hud').element as HTMLElement).style.left).toBe('8px');
  const width = vi.spyOn(document.documentElement, 'clientWidth', 'get').mockReturnValue(800);
  const height = vi.spyOn(document.documentElement, 'clientHeight', 'get').mockReturnValue(600);
  schedule();
  vi.advanceTimersByTime(32);
  await nextTick();
  expect((wrapper.get('.crop-hud').element as HTMLElement).style.maxWidth).toBe('784px');
  width.mockRestore();
  height.mockRestore();
  wrapper.unmount();
  const observe = vi.fn(),
    disconnect = vi.fn();
  vi.stubGlobal(
    'ResizeObserver',
    class {
      observe = observe;
      disconnect = disconnect;
    },
  );
  const empty = mount(
    defineComponent({
      setup() {
        useCropHudPosition(ref(null), ref(null));
        return () => h('div');
      },
    }),
  );
  await nextTick();
  vi.advanceTimersByTime(32);
  expect(observe).not.toHaveBeenCalled();
  empty.unmount();
  expect(disconnect).toHaveBeenCalledOnce();
});
