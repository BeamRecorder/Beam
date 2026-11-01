import { defineComponent, h, ref } from 'vue';
import { enableAutoUnmount, flushPromises, mount } from '@vue/test-utils';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useScreenshotViewport } from '../useScreenshotViewport';

vi.mock('@vueuse/core', async () => {
  const { ref } = await import('vue');
  return { useElementSize: () => ({ width: ref(0), height: ref(0) }) };
});

enableAutoUnmount(afterEach);
beforeEach(() => {
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue(new DOMRect(100, 50, 800, 600));
});
afterEach(() => vi.restoreAllMocks());

const create = async (size = { width: 1200, height: 800 }) => {
  const disabled = ref(false);
  const canvas = ref(size);
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
    expect(context.viewport.zoomPercent.value).toBe(67);
    expect(canvas.value).toEqual({ width: 1200, height: 800 });
  });
  it('zooms at the pointer and reverses the wheel without mutating the output size', async () => {
    const { context, canvas } = await create();
    const event = wheel(-120, 600, 450);
    context.wheel(event);
    expect(event.defaultPrevented).toBe(true);
    expect(context.viewport.zoomPercent.value).toBe(75);
    expect(context.viewport.panX.value).toBeCloseTo(-12);
    expect(context.viewport.panY.value).toBeCloseTo(-12);
    expect(context.stageSize.value.width).toBeCloseTo(896);
    context.wheel(wheel(120, 600, 450));
    expect(context.viewport.zoomPercent.value).toBe(67);
    expect(context.viewport.panX.value).toBeCloseTo(0);
    expect(canvas.value).toEqual({ width: 1200, height: 800 });
  });
  it('bounds repeated zooming and restores the fitted view and pan', async () => {
    const { context } = await create();
    for (let i = 0; i < 100; i++) context.wheel(wheel());
    expect(context.viewport.zoomScale.value).toBe(5);
    for (let i = 0; i < 100; i++) context.wheel(wheel(120));
    expect(context.viewport.zoomScale.value).toBe(0.01);
    context.viewport.panX.value = 20;
    context.viewport.resetZoom();
    expect(context.viewport.zoomPercent.value).toBe(67);
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
    expect(context.viewport.zoomScale.value).toBeCloseTo(2 / 3);
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

  it.each([
    { width: 320, height: 200, expectedWidth: 320, expectedHeight: 200, percent: 100 },
    { width: 12000, height: 2000, expectedWidth: 800, expectedHeight: 800 / 6, percent: 7 },
    { width: 200, height: 1600, expectedWidth: 75, expectedHeight: 600, percent: 38 },
  ])('centers $width × $height without enlarging small images or distorting large ones', async (size) => {
    const { context } = await create(size);
    expect(context.stageSize.value.width).toBeCloseTo(size.expectedWidth);
    expect(context.stageSize.value.height).toBeCloseTo(size.expectedHeight);
    expect(context.controls.zoomPercent.value).toBe(size.percent);
    expect(context.stageStyle.value.transform).toBe('translate(-50%, -50%) translate3d(0px, 0px, 0)');
  });

  it('shows actual size at 100% even for a very wide capture and keeps it on window resize', async () => {
    const { context, canvas } = await create({ width: 12000, height: 2000 });
    const original = { ...canvas.value };
    context.controls.setView('actual');
    expect(context.controls.viewMode.value).toBe('actual');
    expect(context.controls.zoomPercent.value).toBe(100);
    expect(context.stageSize.value).toEqual(original);
    context.available.width.value = 400;
    context.available.height.value = 300;
    expect(context.stageSize.value).toEqual(original);
    expect(context.controls.zoomPercent.value).toBe(100);
    context.controls.setView('fit');
    expect(context.stageSize.value.width).toBe(400);
    expect(context.controls.viewMode.value).toBe('fit');
    expect(canvas.value).toEqual(original);
  });

  it('adjusts a fitted view on resize while retaining a manual zoom and pan', async () => {
    const { context } = await create();
    context.available.width.value = 600;
    expect(context.stageSize.value.width).toBe(600);
    context.controls.setView('zoom-in');
    expect(context.controls.viewMode.value).toBe('manual');
    expect(context.viewport.zoomScale.value).toBe(0.625);
    context.controls.setView('zoom-out');
    expect(context.viewport.zoomScale.value).toBe(0.5);
    context.viewport.panX.value = 30;
    context.available.width.value = 800;
    expect(context.stageSize.value.width).toBe(600);
    expect(context.viewport.panX.value).toBe(30);
    context.controls.resetView();
    expect(context.stageSize.value.width).toBe(800);
    expect(context.viewport.panX.value).toBe(0);
    expect(context.controls.viewMode.value).toBe('fit');
  });

  it('can fit below 1% and blocks menu actions and reset while disabled', async () => {
    const { context, disabled } = await create({ width: 16384, height: 100 });
    context.available.width.value = 80;
    expect(context.stageSize.value.width).toBe(80);
    expect(context.controls.zoomPercent.value).toBe(0.49);
    disabled.value = true;
    for (const action of ['actual', 'fit', 'zoom-in', 'zoom-out'] as const) context.controls.setView(action);
    context.controls.resetView();
    expect(context.stageSize.value.width).toBe(80);
    expect(context.controls.viewMode.value).toBe('fit');
  });
});
