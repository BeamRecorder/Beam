import { enableAutoUnmount, flushPromises, mount } from '@vue/test-utils';
import { afterEach, describe, expect, it, vi } from 'vitest';
import Popover from './Popover.vue';

enableAutoUnmount(afterEach);
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

const mountPopover = () =>
  mount(Popover, {
    attachTo: document.body,
    slots: {
      trigger: '<button>Open</button>',
      default: '<div class="drag-surface">Drag</div>',
    },
  });
const dispatch = (target: EventTarget, type: string) => target.dispatchEvent(new MouseEvent(type, { bubbles: true }));

describe('popover gesture ownership', () => {
  it.each(['pointerdown', 'mousedown'])(
    'ignores the release click from a %s gesture inside its own content',
    async (start) => {
      const wrapper = mountPopover();
      await wrapper.get('.popover-trigger').trigger('click');
      dispatch(document.querySelector('.drag-surface')!, start);
      dispatch(document.body, start === 'pointerdown' ? 'pointerup' : 'mouseup');
      dispatch(document.body, 'click');
      await wrapper.vm.$nextTick();
      expect(document.querySelector('.popover-content')).not.toBeNull();
      expect(wrapper.emitted('toggle')).toEqual([[true]]);
    },
  );

  it('dismisses immediately on a new outside press even before the previous release timer runs', async () => {
    vi.useFakeTimers();
    const wrapper = mountPopover();
    await wrapper.get('.popover-trigger').trigger('click');
    dispatch(document.querySelector('.drag-surface')!, 'mousedown');
    dispatch(document.body, 'mouseup');
    dispatch(document.body, 'mousedown');
    await wrapper.vm.$nextTick();
    expect(document.querySelector('.popover-content')).toBeNull();
  });

  it.each(['mouseup', 'pointerup', 'pointercancel'])(
    'expires the gesture guard after %s without swallowing a later outside click',
    async (end) => {
      vi.useFakeTimers();
      const wrapper = mountPopover();
      await wrapper.get('.popover-trigger').trigger('click');
      dispatch(document.querySelector('.drag-surface')!, 'mousedown');
      dispatch(document.body, end);
      vi.advanceTimersByTime(0);
      dispatch(document.body, 'click');
      await wrapper.vm.$nextTick();
      expect(document.querySelector('.popover-content')).toBeNull();
    },
  );

  it('keeps an inside click followed by a drag open, then respects window blur', async () => {
    const wrapper = mountPopover();
    await wrapper.get('.popover-trigger').trigger('click');
    const surface = document.querySelector('.drag-surface')!;
    dispatch(surface, 'mousedown');
    dispatch(surface, 'mouseup');
    dispatch(surface, 'click');
    dispatch(surface, 'mousedown');
    dispatch(document.body, 'mouseup');
    dispatch(document.body, 'click');
    await wrapper.vm.$nextTick();
    expect(document.querySelector('.popover-content')).not.toBeNull();
    window.dispatchEvent(new Event('blur'));
    await wrapper.vm.$nextTick();
    expect(document.querySelector('.popover-content')).toBeNull();
  });

  it('cancels pending gesture cleanup when the popover unmounts', async () => {
    vi.useFakeTimers();
    const wrapper = mountPopover();
    await wrapper.get('.popover-trigger').trigger('click');
    dispatch(document.querySelector('.drag-surface')!, 'mousedown');
    dispatch(document.body, 'pointerup');
    dispatch(document.body, 'mouseup');
    expect(vi.getTimerCount()).toBe(1);
    wrapper.unmount();
    expect(vi.getTimerCount()).toBe(0);
  });

  it('honors disabling during a gesture and retains normal dismissal after re-enabling', async () => {
    const wrapper = mountPopover();
    await wrapper.get('.popover-trigger').trigger('click');
    dispatch(document.querySelector('.drag-surface')!, 'mousedown');
    await wrapper.setProps({ disabled: true });
    dispatch(document.body, 'mouseup');
    dispatch(document.body, 'click');
    await wrapper.vm.$nextTick();
    expect(document.querySelector('.popover-content')).toBeNull();
    await wrapper.setProps({ disabled: false });
    await wrapper.get('.popover-trigger').trigger('click');
    dispatch(document.body, 'mousedown');
    await wrapper.vm.$nextTick();
    expect(document.querySelector('.popover-content')).toBeNull();
  });

  it('repositions a live gesture when direction changes without treating resize as an outside press', async () => {
    const wrapper = mountPopover();
    vi.spyOn(wrapper.get('.popover-trigger').element, 'getBoundingClientRect').mockReturnValue(
      new DOMRect(50, 20, 100, 20),
    );
    await wrapper.get('.popover-trigger').trigger('click');
    await flushPromises();
    dispatch(document.querySelector('.drag-surface')!, 'mousedown');
    await wrapper.setProps({ direction: 'up' });
    window.dispatchEvent(new Event('resize'));
    await flushPromises();
    expect(document.querySelector('.popover-content')?.classList.contains('down')).toBe(true);
    dispatch(document.body, 'mouseup');
    dispatch(document.body, 'click');
    await wrapper.vm.$nextTick();
    expect(document.querySelector('.popover-content')).not.toBeNull();
  });

  it('keeps resize observation alive after a drag and disconnects it on dismissal', async () => {
    const callbacks: ResizeObserverCallback[] = [];
    const disconnect = vi.fn();
    vi.stubGlobal(
      'ResizeObserver',
      class {
        constructor(callback: ResizeObserverCallback) {
          callbacks.push(callback);
        }
        observe = vi.fn();
        disconnect = disconnect;
      },
    );
    const wrapper = mountPopover();
    await wrapper.get('.popover-trigger').trigger('click');
    await flushPromises();
    dispatch(document.querySelector('.drag-surface')!, 'mousedown');
    dispatch(document.body, 'mouseup');
    dispatch(document.body, 'click');
    callbacks[0]!([], {} as ResizeObserver);
    await flushPromises();
    expect(document.querySelector('.popover-content')).not.toBeNull();
    dispatch(document.body, 'mousedown');
    await wrapper.vm.$nextTick();
    expect(disconnect).toHaveBeenCalled();
    expect(document.querySelector('.popover-content')).toBeNull();
    window.dispatchEvent(new Event('resize'));
    await wrapper.vm.$nextTick();
    expect(document.querySelector('.popover-content')).toBeNull();
  });
});
