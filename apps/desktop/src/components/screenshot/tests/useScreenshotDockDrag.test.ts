import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { mount, enableAutoUnmount } from '@vue/test-utils';
import { defineComponent, h, nextTick, ref } from 'vue';
import { useScreenshotDockDrag } from '../useScreenshotDockDrag';
import type { ScreenshotDockTool } from '../screenshot-dock-types';

enableAutoUnmount(afterEach);
beforeEach(() => vi.useFakeTimers());
afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});
const event = (x = 80, transfer = true) =>
  ({
    clientX: x,
    preventDefault: vi.fn(),
    relatedTarget: null,
    dataTransfer: transfer ? { effectAllowed: '', dropEffect: '', setData: vi.fn() } : null,
  }) as unknown as DragEvent;
const create = (hasViewport = true) => {
  const tools = ref<ScreenshotDockTool[]>([
    { id: 'arrow', label: 'Arrow' },
    { id: 'text', label: 'Text' },
    { id: 'shape', label: 'Shape' },
  ]);
  const disabled = ref(false),
    reorder = vi.fn();
  let drag!: ReturnType<typeof useScreenshotDockDrag>;
  const wrapper = mount(
    defineComponent({
      setup() {
        const row = ref<HTMLElement | null>(null);
        drag = useScreenshotDockDrag(
          row,
          () => tools.value,
          () => disabled.value,
          reorder,
        );
        return () =>
          h('div', { class: hasViewport ? 'scroll-shadow-viewport' : '' }, [
            h(
              'div',
              { ref: row, class: 'row' },
              tools.value.map((tool) => h('div', { 'data-dock-tool': tool.id })),
            ),
          ]);
      },
    }),
    { attachTo: document.body },
  );
  Object.defineProperties(wrapper.element, {
    scrollWidth: { configurable: true, value: 300 },
    clientWidth: { configurable: true, value: 100 },
  });
  vi.spyOn(wrapper.element, 'getBoundingClientRect').mockReturnValue(new DOMRect(0, 0, 100, 40));
  wrapper.findAll('[data-dock-tool]').forEach((entry, index) => {
    vi.spyOn(entry.element, 'getBoundingClientRect').mockImplementation(
      () => new DOMRect(index * 38 - wrapper.element.scrollLeft, 0, 36, 36),
    );
  });
  return { wrapper, drag, disabled, tools, reorder };
};
it('publishes a local move payload and marks insertion before/between/after, excluding no-op slots', () => {
  const { drag } = create(),
    start = event();
  drag.start(start, 'arrow');
  expect(start.dataTransfer?.effectAllowed).toBe('move');
  expect(start.dataTransfer?.setData).toHaveBeenCalledWith('application/x-beam-dock-tool', 'arrow');
  drag.over(event(10));
  expect(drag.marker(0)).toBe(false);
  drag.over(event(40));
  expect(drag.marker(1)).toBe(false);
  drag.over(event(65));
  expect(drag.marker(2)).toBe(true);
  drag.over(event(110));
  expect(drag.marker(3)).toBe(true);
});
it('drops at the measured insertion boundary once and clears drag state', () => {
  const { drag, reorder } = create();
  drag.start(event(), 'shape');
  drag.drop(event(0));
  expect(reorder).toHaveBeenCalledExactlyOnceWith('shape', 0);
  expect(drag.dragged.value).toBeNull();
  expect(drag.marker(0)).toBe(false);
  drag.drop(event(100));
  expect(reorder).toHaveBeenCalledOnce();
});
it('rejects external drags and disables local drag/drop without preventing unrelated drags', async () => {
  const { drag, disabled, reorder } = create(),
    external = event();
  drag.over(external);
  expect(external.preventDefault).not.toHaveBeenCalled();
  disabled.value = true;
  await nextTick();
  const start = event();
  drag.start(start, 'arrow');
  expect(start.preventDefault).toHaveBeenCalledOnce();
  expect(drag.dragged.value).toBeNull();
  disabled.value = false;
  await nextTick();
  drag.start(event(), 'arrow');
  disabled.value = true;
  drag.drop(event(100));
  expect(reorder).not.toHaveBeenCalled();
});
it('scrolls at the right and left edges only during a drag and stops at bounds', async () => {
  const { wrapper, drag } = create();
  drag.start(event(), 'arrow');
  drag.over(event(98));
  vi.advanceTimersByTime(1000);
  await nextTick();
  expect(wrapper.element.scrollLeft).toBe(200);
  drag.over(event(0));
  vi.advanceTimersByTime(1000);
  await nextTick();
  expect(wrapper.element.scrollLeft).toBe(0);
  drag.over(event(50));
  vi.advanceTimersByTime(100);
  expect(wrapper.element.scrollLeft).toBe(0);
});
it('keeps a child-to-child drag active, clears the indicator on leaving and allows reentry', () => {
  const { wrapper, drag } = create();
  drag.start(event(), 'shape');
  drag.over(event(0));
  drag.outside({ relatedTarget: wrapper.get('[data-dock-tool]').element } as DragEvent);
  expect(drag.marker(0)).toBe(true);
  drag.outside(event());
  expect(drag.marker(0)).toBe(false);
  vi.advanceTimersByTime(100);
  expect(wrapper.element.scrollLeft).toBe(0);
  drag.over(event(0));
  expect(drag.marker(0)).toBe(true);
  drag.cancel();
  expect(drag.dragged.value).toBeNull();
});
it('cancels on blur, changes in available tools, disabling and disposal', async () => {
  const { wrapper, drag, tools, disabled } = create();
  drag.start(event(), 'arrow');
  drag.over(event(98));
  window.dispatchEvent(new Event('blur'));
  expect(drag.dragged.value).toBeNull();
  drag.start(event(), 'arrow');
  tools.value.pop();
  await nextTick();
  expect(drag.dragged.value).toBeNull();
  drag.start(event(), 'arrow');
  disabled.value = true;
  await nextTick();
  expect(drag.dragged.value).toBeNull();
  disabled.value = false;
  await nextTick();
  drag.start(event(), 'arrow');
  drag.over(event(98));
  wrapper.unmount();
  vi.advanceTimersByTime(100);
  expect(drag.dragged.value).toBeNull();
});
it('handles missing transfer data, viewports and removed row elements', async () => {
  const { drag } = create(false);
  drag.start(event(0, false), 'text');
  drag.over(event(0, false));
  vi.advanceTimersByTime(32);
  expect(drag.marker(0)).toBe(true);
  const { wrapper, drag: removed } = create();
  wrapper.unmount();
  removed.start(event(), 'arrow');
  removed.over(event());
  vi.advanceTimersByTime(32);
  removed.cancel();
  await nextTick();
});
