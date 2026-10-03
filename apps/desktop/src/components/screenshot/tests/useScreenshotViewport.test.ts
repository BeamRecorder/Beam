import { defineComponent, h, ref } from 'vue';
import { enableAutoUnmount, flushPromises, mount } from '@vue/test-utils';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@vueuse/core', async () => {
  const { ref } = await import('vue');
  return { useElementSize: () => ({ width: ref(0), height: ref(0) }) };
});
import { useScreenshotViewport } from '../useScreenshotViewport';

enableAutoUnmount(afterEach);
beforeEach(() => {
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue(new DOMRect(100, 50, 800, 600));
});
afterEach(() => vi.restoreAllMocks());

const create = async () => {
  const disabled = ref(false);
  const canvas = ref({ width: 1200, height: 800 });
  let context!: ReturnType<typeof useScreenshotViewport>;
  const wrapper = mount(
    defineComponent({
      setup() {
        const stage = ref<HTMLElement | null>(null);
        context = useScreenshotViewport(
          stage,
          () => canvas.value,
          () => disabled.value,
        );
        return () => h('div', { ref: stage });
      },
    }),
  );
  const capture = vi.fn(),
    release = vi.fn();
  Object.assign(wrapper.element, {
    setPointerCapture: capture,
    hasPointerCapture: () => true,
    releasePointerCapture: release,
  });
  await flushPromises();
  return { wrapper, context, disabled, canvas, capture, release };
};
const wheel = (deltaY = -120, clientX = 500, clientY = 350) =>
  new WheelEvent('wheel', { deltaY, clientX, clientY, cancelable: true });
const pointer = (button = 1, clientX = 400, clientY = 300) =>
  ({
    button,
    clientX,
    clientY,
    pointerId: 3,
    preventDefault: vi.fn(),
    stopPropagation: vi.fn(),
  }) as unknown as PointerEvent;

describe('Screenshot viewport', () => {
  it('measures the hidden native editor once on mount and fits the source without changing its dimensions', async () => {
    const { context, canvas } = await create();
    expect(context.available.width.value).toBe(800);
    expect(context.available.height.value).toBe(600);
    expect(context.stageSize.value.width).toBe(800);
    expect(context.stageSize.value.height).toBeCloseTo(533.333);
    expect(context.viewport.zoomPercent.value).toBe(100);
    expect(canvas.value).toEqual({ width: 1200, height: 800 });
  });
  it('zooms at the pointer and reverses the wheel without mutating the output size', async () => {
    const { context, canvas } = await create();
    const event = wheel(-120, 600, 450);
    context.wheel(event);
    expect(event.defaultPrevented).toBe(true);
    expect(context.viewport.zoomPercent.value).toBe(112);
    expect(context.viewport.panX.value).toBeCloseTo(-12);
    expect(context.viewport.panY.value).toBeCloseTo(-12);
    expect(context.stageSize.value.width).toBeCloseTo(896);
    context.wheel(wheel(120, 600, 450));
    expect(context.viewport.zoomPercent.value).toBe(100);
    expect(context.viewport.panX.value).toBeCloseTo(0);
    expect(canvas.value).toEqual({ width: 1200, height: 800 });
  });
  it('bounds repeated zooming and restores the fitted view and pan', async () => {
    const { context } = await create();
    for (let i = 0; i < 100; i++) context.wheel(wheel());
    expect(context.viewport.zoomScale.value).toBe(5);
    for (let i = 0; i < 100; i++) context.wheel(wheel(120));
    expect(context.viewport.zoomScale.value).toBe(0.25);
    context.viewport.panX.value = 20;
    context.viewport.resetZoom();
    expect(context.viewport.zoomPercent.value).toBe(100);
    expect(context.viewport.panX.value).toBe(0);
    expect(context.viewport.panY.value).toBe(0);
  });
  it('ignores unavailable geometry, disabled controls, horizontal wheels and invalid deltas', async () => {
    const { context, disabled, wrapper } = await create();
    for (const delta of [0, Number.NaN]) {
      const event = wheel(0);
      Object.defineProperty(event, 'deltaY', { value: delta });
      context.wheel(event);
      expect(event.defaultPrevented).toBe(false);
    }
    disabled.value = true;
    context.wheel(wheel());
    disabled.value = false;
    vi.spyOn(wrapper.element, 'getBoundingClientRect').mockReturnValue(new DOMRect());
    context.wheel(wheel());
    wrapper.unmount();
    context.wheel(wheel());
    expect(context.viewport.zoomScale.value).toBe(1);
  });
  it('pans with the middle button, preserves zoom while dragging and releases pointer capture', async () => {
    const { context, capture, release } = await create();
    const start = pointer();
    context.beginPan(start);
    expect(start.preventDefault).toHaveBeenCalledOnce();
    expect(capture).toHaveBeenCalledWith(3);
    const event = wheel();
    context.wheel(event);
    expect(event.defaultPrevented).toBe(false);
    const moved = pointer(1, 460, 330);
    context.movePan(moved);
    expect(moved.stopPropagation).toHaveBeenCalledOnce();
    expect(context.viewport.panX.value).toBe(60);
    expect(context.viewport.panY.value).toBe(30);
    expect(context.stageStyle.value.transform).toContain('translate3d(60px, 30px, 0)');
    context.endPan(moved);
    expect(context.viewport.isPanning.value).toBe(false);
    expect(release).toHaveBeenCalledWith(3);
  });
  it('keeps normal selection gestures intact and allows Space plus drag without handling disabled gestures', async () => {
    const { context, disabled } = await create();
    const ordinary = pointer(0);
    context.beginPan(ordinary);
    context.movePan(ordinary);
    context.endPan(ordinary);
    expect(ordinary.preventDefault).not.toHaveBeenCalled();
    expect(ordinary.stopPropagation).not.toHaveBeenCalled();
    disabled.value = true;
    context.beginPan(pointer());
    expect(context.viewport.isPanning.value).toBe(false);
    disabled.value = false;
    window.dispatchEvent(new KeyboardEvent('keydown', { code: 'Space' }));
    context.beginPan(pointer(0));
    expect(context.viewport.isPanning.value).toBe(true);
    context.endPan(pointer(0));
    window.dispatchEvent(new KeyboardEvent('keyup', { code: 'Space' }));
    expect(context.viewport.isSpacePressed.value).toBe(false);
  });
});
