import { createTimelineFrameQueue } from '@beam/runtime/timeline/frame-queue';
import { mount } from '@vue/test-utils';
import { defineComponent, h, ref, reactive, nextTick } from 'vue';
import { afterEach, expect, it, vi } from 'vitest';
import { useTimelineSurface } from '../useTimelineSurface';
import TimelineCanvasLane from '../../TimelineCanvasLane.vue';
import TimelineSurfaceCanvas from '../../TimelineSurfaceCanvas.vue';
const paint = vi.hoisted(() => vi.fn());
vi.mock('@beam/runtime/timeline/timeline-canvas-paint', () => ({ paintTimelineCanvas: paint }));
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  paint.mockClear();
});
function setup(count = 2) {
  const frames = new Map<number, FrameRequestCallback>();
  let sequence = 0;
  const raf = vi.spyOn(window, 'requestAnimationFrame').mockImplementation((frame) => {
    frames.set(++sequence, frame);
    return sequence;
  });
  vi.spyOn(window, 'cancelAnimationFrame').mockImplementation((id) => {
    frames.delete(id);
  });
  const context = {
    setTransform: vi.fn(),
    clearRect: vi.fn(),
    save: vi.fn(),
    translate: vi.fn(),
    beginPath: vi.fn(),
    rect: vi.fn(),
    clip: vi.fn(),
    restore: vi.fn(),
  };
  const get = vi
    .spyOn(HTMLCanvasElement.prototype, 'getContext')
    .mockReturnValue(context as unknown as CanvasRenderingContext2D);
  let resize!: () => void, theme!: () => void;
  const disconnect = vi.fn(),
    unobserve = vi.fn();
  vi.stubGlobal(
    'ResizeObserver',
    class {
      constructor(callback: () => void) {
        resize = callback;
      }
      observe = vi.fn();
      unobserve = unobserve;
      disconnect = disconnect;
    },
  );
  vi.stubGlobal(
    'MutationObserver',
    class {
      constructor(callback: () => void) {
        theme = callback;
      }
      observe = vi.fn();
      disconnect = disconnect;
    },
  );
  const tokens: Record<string, string> = {
    '--radius-sm': '6px',
    '--timeline-item-tint': '30%',
    '--timeline-disabled-opacity': '0.3',
  };
  vi.spyOn(window, 'getComputedStyle').mockImplementation(
    (element) =>
      ({
        zIndex: (element as HTMLElement).style.zIndex || 'auto',
        getPropertyValue: (key: string) => tokens[key] ?? '#111',
      }) as CSSStyleDeclaration,
  );
  vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockReturnValue(900);
  vi.spyOn(HTMLElement.prototype, 'clientHeight', 'get').mockReturnValue(320);
  vi.spyOn(HTMLElement.prototype, 'offsetWidth', 'get').mockReturnValue(900);
  vi.spyOn(window, 'devicePixelRatio', 'get').mockReturnValue(2);
  let scroll!: HTMLDivElement;
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (this: HTMLElement) {
    const lane = this.classList.contains('timeline-canvas-lane');
    const left = lane ? 80 - (scroll?.scrollLeft ?? 0) : 0,
      top = lane ? 50 : 0;
    return {
      x: left,
      y: top,
      left,
      top,
      right: left + 900,
      bottom: top + 32,
      width: 900,
      height: lane ? 32 : 320,
    } as DOMRect;
  });
  const props = reactive({
    items: [],
    width: 1e9,
    durationMs: 1e12,
    viewport: { left: 0, top: 0, width: 900, height: 320 },
  });
  let owner!: ReturnType<typeof useTimelineSurface>;
  const Host = defineComponent({
    setup() {
      const element = ref<HTMLDivElement | null>(null),
        surface = useTimelineSurface(
          element,
          createTimelineFrameQueue({ request: requestAnimationFrame, cancel: cancelAnimationFrame }),
        );
      owner = surface;
      return () =>
        h(
          'div',
          {
            ref: (value: unknown) => {
              element.value = value as HTMLDivElement;
              scroll = element.value;
            },
          },
          [
            h(TimelineSurfaceCanvas),
            ...Array.from({ length: count }, (_, key) => h(TimelineCanvasLane, { ...props, key })),
          ],
        );
    },
  });
  const wrapper = mount(Host);
  const flush = () => {
    const pending = [...frames.values()];
    frames.clear();
    pending.forEach((frame) => frame(0));
  };
  return {
    wrapper,
    context,
    get,
    raf,
    frames,
    flush,
    resize: () => resize(),
    theme: () => theme(),
    tokens,
    disconnect,
    unobserve,
    scroll: () => scroll,
    owner: () => owner,
    props,
  };
}
it('uses one viewport-sized bitmap and redraw clock for all registered tracks', () => {
  const state = setup(40);
  expect(state.wrapper.findAll('canvas')).toHaveLength(1);
  expect(state.raf).toHaveBeenCalledOnce();
  state.flush();
  expect([state.wrapper.get('canvas').element.width, state.wrapper.get('canvas').element.height]).toEqual([1800, 640]);
  expect(paint).toHaveBeenCalledTimes(40);
  expect(state.frames.size).toBe(0);
  state.wrapper.unmount();
  expect(state.frames.size).toBe(0);
  expect(state.unobserve).toHaveBeenCalledTimes(40);
});
it('follows transformed lane geometry until all reorder owners finish, then becomes idle', () => {
  const state = setup(1),
    first = Symbol('first'),
    second = Symbol('second');
  state.flush();
  state.owner().followMoves(first, true);
  state.owner().followMoves(second, true);
  expect(state.frames.size).toBe(1);
  state.flush();
  expect(state.frames.size).toBe(1);
  state.owner().followMoves(first, false);
  state.flush();
  expect(state.frames.size).toBe(1);
  state.owner().followMoves(second, false);
  state.flush();
  expect(state.frames.size).toBe(0);
  state.wrapper.unmount();
});
it.each(['dom', 'dragged', 'idle'])('paints overlapping rows in %s order without sorting idle lanes', (mode) => {
  const state = setup(0);
  const first = document.createElement('div'),
    second = document.createElement('div');
  first.className = second.className = 'timeline-canvas-lane';
  first.dataset.timelineRowId = 'first';
  state.wrapper.element.append(second, first);
  const firstProps = { ...state.props, items: [] },
    secondProps = { ...state.props, items: [] };
  state.owner().register({ element: first, props: firstProps, marquee: () => undefined });
  state.owner().register({ element: second, props: secondProps, marquee: () => undefined });
  if (mode === 'dragged') second.style.zIndex = '10';
  if (mode !== 'idle') state.owner().followMoves(Symbol('move'), true);
  state.flush();
  const expected = mode === 'dom' ? [secondProps.items, firstProps.items] : [firstProps.items, secondProps.items];
  expect(paint.mock.calls[0]![1]).toBe(expected[0]);
  expect(paint.mock.calls[1]![1]).toBe(expected[1]);
  state.wrapper.unmount();
});
it('coalesces interrupted reorder ownership and cancels its frame on disposal', () => {
  const state = setup(1),
    owner = Symbol('move');
  state.flush();
  state.owner().followMoves(owner, true);
  state.owner().followMoves(owner, true);
  state.owner().followMoves(owner, false);
  state.owner().followMoves(owner, true);
  expect(state.frames.size).toBe(1);
  state.wrapper.unmount();
  expect(state.frames.size).toBe(0);
  state.owner().followMoves(owner, false);
  expect(state.frames.size).toBe(0);
});
it('does not allocate or paint empty and detached viewports, and cancels pending work on unmount', () => {
  const state = setup(1);
  vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockReturnValue(0);
  state.flush();
  expect(paint).not.toHaveBeenCalled();
  vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockReturnValue(900);
  vi.spyOn(HTMLElement.prototype, 'clientHeight', 'get').mockReturnValue(0);
  state.resize();
  state.flush();
  expect(paint).not.toHaveBeenCalled();
  vi.spyOn(HTMLElement.prototype, 'clientHeight', 'get').mockReturnValue(320);
  state.owner().canvas.value = null;
  state.resize();
  state.flush();
  expect(state.owner().context()).toBeNull();
  expect(paint).not.toHaveBeenCalled();
  state.resize();
  expect(state.frames.size).toBe(1);
  state.wrapper.unmount();
  state.owner().invalidate();
  expect(state.frames.size).toBe(0);
});
it('skips vertically/horizontally invisible lanes and handles a zero-sized lane', async () => {
  const state = setup(1);
  state.flush();
  paint.mockClear();
  const rect = (x: number, y: number, height: number) =>
    ({ x, y, left: x, top: y, width: 900, height, right: x + 900, bottom: y + height }) as DOMRect;
  for (const [x, y, height] of [
    [0, -100, 32],
    [0, 400, 32],
    [1000, 50, 32],
    [0, 50, 0],
  ]) {
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (this: HTMLElement) {
      return this.classList.contains('timeline-canvas-lane') ? rect(x!, y!, height!) : rect(0, 0, 320);
    });
    state.resize();
    state.flush();
  }
  expect(paint).not.toHaveBeenCalled();
  state.props.width = 0;
  await nextTick();
  state.flush();
  expect(paint).not.toHaveBeenCalled();
  state.wrapper.unmount();
});
it('uses a unit scale while CSS bounds or device ratio are unavailable', () => {
  const state = setup(1);
  vi.spyOn(window, 'devicePixelRatio', 'get').mockReturnValue(0);
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue({
    x: 0,
    y: 0,
    left: 0,
    top: 0,
    width: 0,
    height: 32,
    right: 0,
    bottom: 32,
  } as DOMRect);
  state.flush();
  expect(state.wrapper.get('canvas').element.width).toBe(900);
  expect(paint).toHaveBeenCalledOnce();
  state.wrapper.unmount();
});
it('leaves placement to the native sticky frame and repaints bounded scroll coordinates', async () => {
  const state = setup(1);
  state.flush();
  const canvas = state.wrapper.get('canvas').element;
  state.scroll().scrollLeft = 200;
  await state.wrapper.trigger('scroll');
  expect(canvas.style.left).toBe('');
  state.flush();
  expect(canvas.style.left).toBe('');
  expect(canvas.width).toBe(1800);
  expect(paint.mock.calls.at(-1)?.[2]).toMatchObject({ left: 120, viewportWidth: 900 });
  state.wrapper.unmount();
});
it('requires a surface owner and releases the shared canvas reference on unmount', () => {
  vi.spyOn(console, 'warn').mockImplementation(() => {});
  expect(() => mount(TimelineSurfaceCanvas)).toThrow('requires the shared surface');
  const state = setup(0);
  expect(state.owner().canvas.value).toBeInstanceOf(HTMLCanvasElement);
  state.wrapper.unmount();
  expect(state.owner().canvas.value).toBeNull();
});
it('coalesces theme/size invalidation, reads tokens and reports unavailable rendering', () => {
  const state = setup(1);
  state.flush();
  state.tokens['--radius-sm'] = '9px';
  state.theme();
  state.resize();
  window.dispatchEvent(new Event('resize'));
  expect(state.frames.size).toBe(1);
  state.flush();
  expect(paint.mock.calls.at(-1)?.[3].radius).toBe(9);
  state.get.mockReturnValueOnce(null);
  state.resize();
  expect(state.flush).toThrow('context unavailable');
  state.wrapper.unmount();
  expect(state.disconnect).toHaveBeenCalledTimes(2);
});
