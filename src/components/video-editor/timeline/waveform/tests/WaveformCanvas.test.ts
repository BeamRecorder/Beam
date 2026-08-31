import { mount } from '@vue/test-utils';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { nextTick } from 'vue';
import WaveformCanvas from '../WaveformCanvas.vue';

type FakeCanvasContext = {
  setTransform: ReturnType<typeof vi.fn>;
  clearRect: ReturnType<typeof vi.fn>;
  beginPath: ReturnType<typeof vi.fn>;
  moveTo: ReturnType<typeof vi.fn>;
  lineTo: ReturnType<typeof vi.fn>;
  stroke: ReturnType<typeof vi.fn>;
  fillRect: ReturnType<typeof vi.fn>;
  strokeRect: ReturnType<typeof vi.fn>;
  strokeStyle: string;
  globalAlpha: number;
  lineCap: CanvasLineCap;
  lineWidth: number;
};

const originalDevicePixelRatio = window.devicePixelRatio;

let context: FakeCanvasContext;
let bounds = { width: 120, height: 40 };
let pendingFrames: Map<number, FrameRequestCallback>;
let nextFrameId: number;
let resizeCallback: ResizeObserverCallback | null;
let observers: Array<{ observe: ReturnType<typeof vi.fn>; disconnect: ReturnType<typeof vi.fn> }>;

const flushAnimationFrames = () => {
  const frames = [...pendingFrames.entries()];
  pendingFrames.clear();
  for (const [, callback] of frames) callback(0);
};

const notifyResize = () => {
  resizeCallback?.([] as ResizeObserverEntry[], {} as ResizeObserver);
};

const waitForDraw = async () => {
  await nextTick();
  await nextTick();
  flushAnimationFrames();
};

beforeEach(() => {
  context = {
    setTransform: vi.fn(),
    clearRect: vi.fn(),
    beginPath: vi.fn(),
    moveTo: vi.fn(),
    lineTo: vi.fn(),
    stroke: vi.fn(),
    fillRect: vi.fn(),
    strokeRect: vi.fn(),
    strokeStyle: '',
    globalAlpha: 1,
    lineCap: 'butt',
    lineWidth: 1,
  };
  bounds = { width: 120, height: 40 };
  pendingFrames = new Map();
  nextFrameId = 0;
  resizeCallback = null;
  observers = [];

  Object.defineProperty(window, 'devicePixelRatio', { configurable: true, value: 1 });
  vi.stubGlobal(
    'requestAnimationFrame',
    vi.fn((callback: FrameRequestCallback) => {
      const id = ++nextFrameId;
      pendingFrames.set(id, callback);
      return id;
    }),
  );
  vi.stubGlobal(
    'cancelAnimationFrame',
    vi.fn((id: number) => {
      pendingFrames.delete(id);
    }),
  );
  vi.stubGlobal(
    'ResizeObserver',
    class TestResizeObserver {
      observe = vi.fn();
      disconnect = vi.fn();

      constructor(callback: ResizeObserverCallback) {
        resizeCallback = callback;
        observers.push(this);
      }
    },
  );
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(
    () => context as unknown as CanvasRenderingContext2D,
  );
  vi.spyOn(HTMLCanvasElement.prototype, 'getBoundingClientRect').mockImplementation(
    () => ({ width: bounds.width, height: bounds.height }) as DOMRect,
  );
});

afterEach(() => {
  Object.defineProperty(window, 'devicePixelRatio', {
    configurable: true,
    value: originalDevicePixelRatio,
  });
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('WaveformCanvas', () => {
  it('keeps one canvas for empty, small, and large bar arrays and redraws when bars change', async () => {
    const wrapper = mount(WaveformCanvas, { props: { bars: [4, 10], selected: false } });
    await waitForDraw();

    expect(wrapper.findAll('canvas')).toHaveLength(1);
    expect(context.clearRect).toHaveBeenCalledTimes(1);

    await wrapper.setProps({ bars: [] });
    await waitForDraw();
    await wrapper.setProps({ bars: Array.from({ length: 200 }, (_, index) => index + 1) });
    await waitForDraw();

    expect(wrapper.findAll('canvas')).toHaveLength(1);
    expect(context.clearRect).toHaveBeenCalledTimes(3);
    expect(context.stroke).toHaveBeenCalledTimes(2);
    wrapper.unmount();
  });

  it('uses the device pixel ratio for the backing bitmap without changing logical draw coordinates', async () => {
    Object.defineProperty(window, 'devicePixelRatio', { configurable: true, value: 2 });
    const wrapper = mount(WaveformCanvas, { props: { bars: [8, 16], selected: true } });
    await waitForDraw();

    const canvas = wrapper.get('canvas').element as HTMLCanvasElement;
    expect(canvas.width).toBe(240);
    expect(canvas.height).toBe(80);
    expect(context.setTransform).toHaveBeenLastCalledWith(2, 0, 0, 2, 0, 0);
    expect(context.clearRect).toHaveBeenLastCalledWith(0, 0, 120, 40);
    wrapper.unmount();
  });

  it('draws thin centered bars rather than full-height rectangles', async () => {
    const wrapper = mount(WaveformCanvas, { props: { bars: [4, 10, 20], selected: false } });
    await waitForDraw();

    const moveCalls = context.moveTo.mock.calls as Array<[number, number]>;
    const lineCalls = context.lineTo.mock.calls as Array<[number, number]>;
    expect(moveCalls).toHaveLength(40);
    expect(lineCalls).toHaveLength(40);
    expect(context.lineWidth).toBeGreaterThan(0);
    expect(context.lineWidth).toBeLessThanOrEqual(2);
    expect(context.lineCap).toBe('round');

    for (const [index, [x, top]] of moveCalls.entries()) {
      const [lineX, bottom] = lineCalls[index]!;
      expect(lineX).toBe(x);
      expect(top).toBeGreaterThan(0);
      expect(bottom).toBeLessThan(bounds.height);
      expect(top + bottom).toBeCloseTo(bounds.height);
    }
    expect(context.fillRect).not.toHaveBeenCalled();
    expect(context.strokeRect).not.toHaveBeenCalled();
    wrapper.unmount();
  });

  it('densifies sparse input to approximately one bar every three pixels', async () => {
    const wrapper = mount(WaveformCanvas, { props: { bars: [8, 24], selected: false } });
    await waitForDraw();

    const moveCalls = context.moveTo.mock.calls as Array<[number, number]>;
    expect(moveCalls).toHaveLength(Math.floor(bounds.width / 3));
    expect(moveCalls[0]![0]).toBeCloseTo(1.5);
    expect(moveCalls.at(-1)![0]).toBeCloseTo(bounds.width - 1.5);
    for (let index = 1; index < moveCalls.length; index += 1)
      expect(moveCalls[index]![0] - moveCalls[index - 1]![0]).toBeCloseTo(3);
    wrapper.unmount();
  });

  it('does not schedule redraws for bars or resize changes while drawing is deferred', async () => {
    const wrapper = mount(WaveformCanvas, { props: { bars: [8, 16], selected: false, deferDraw: true } });
    await nextTick();

    bounds = { width: 200, height: 60 };
    notifyResize();
    await wrapper.setProps({ bars: [4, 10, 20], selected: true });
    await nextTick();

    expect(window.requestAnimationFrame).not.toHaveBeenCalled();
    expect(pendingFrames.size).toBe(0);
    expect(context.clearRect).not.toHaveBeenCalled();
    wrapper.unmount();
  });

  it('schedules one redraw when deferred drawing resumes and uses the latest props', async () => {
    const wrapper = mount(WaveformCanvas, { props: { bars: [8], selected: false, deferDraw: true } });

    await wrapper.setProps({ bars: [4, 10, 20], selected: true });
    await wrapper.setProps({ deferDraw: false });
    await nextTick();
    await nextTick();

    expect(window.requestAnimationFrame).toHaveBeenCalledTimes(1);
    expect(pendingFrames.size).toBe(1);

    flushAnimationFrames();

    expect(context.clearRect).toHaveBeenCalledTimes(1);
    expect(context.strokeStyle).toBe('#056247');
    expect(context.moveTo.mock.calls).toHaveLength(Math.floor(bounds.width / 3));
    wrapper.unmount();
  });

  it('cancels the pending redraw when unmounted after deferred drawing resumes', async () => {
    const wrapper = mount(WaveformCanvas, { props: { bars: [8, 16], selected: false, deferDraw: true } });
    await wrapper.setProps({ deferDraw: false });
    await nextTick();
    await nextTick();

    expect(pendingFrames.size).toBe(1);
    wrapper.unmount();

    expect(window.cancelAnimationFrame).toHaveBeenLastCalledWith(expect.any(Number));
    expect(pendingFrames.size).toBe(0);
    flushAnimationFrames();
    expect(context.clearRect).not.toHaveBeenCalled();
  });

  it('redraws on a resize and cancels the pending frame and observer on unmount', async () => {
    const wrapper = mount(WaveformCanvas, { props: { bars: [8, 16], selected: false } });
    await waitForDraw();
    const clearCountBeforeResize = context.clearRect.mock.calls.length;

    bounds = { width: 200, height: 60 };
    notifyResize();
    flushAnimationFrames();

    const canvas = wrapper.get('canvas').element as HTMLCanvasElement;
    expect(context.clearRect.mock.calls.length).toBe(clearCountBeforeResize + 1);
    expect(canvas.width).toBe(200);
    expect(canvas.height).toBe(60);

    notifyResize();
    expect(pendingFrames.size).toBe(1);
    const clearCountBeforeUnmount = context.clearRect.mock.calls.length;
    const observer = observers[0]!;
    wrapper.unmount();

    expect(observer.disconnect).toHaveBeenCalledOnce();
    expect(window.cancelAnimationFrame).toHaveBeenLastCalledWith(expect.any(Number));
    expect(pendingFrames.size).toBe(0);
    flushAnimationFrames();
    expect(context.clearRect.mock.calls.length).toBe(clearCountBeforeUnmount);
  });
});
