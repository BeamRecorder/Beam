import { mount } from '@vue/test-utils';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { nextTick } from 'vue';
import type { BlickWaveformData, BlickWaveformRenderer } from '../blick-waveform-types';
import BlickWaveformCanvas from '../BlickWaveformCanvas.vue';
import { acquireBlickWaveformRenderer } from '../blick-waveform-renderer';

vi.mock('~/i18n/useTranslate', () => ({ useTranslate: () => ({ t: (key: string) => key }) }));
vi.mock('../blick-waveform-renderer', () => ({ acquireBlickWaveformRenderer: vi.fn() }));

const acquireRenderer = vi.mocked(acquireBlickWaveformRenderer);
const originalDevicePixelRatio = window.devicePixelRatio;
const originalMatchMediaDescriptor = Object.getOwnPropertyDescriptor(window, 'matchMedia');

let bounds = { width: 120, height: 40 };
let pendingFrames: Map<number, FrameRequestCallback>;
let nextFrameId: number;
let resizeCallback: ResizeObserverCallback | null;
let observers: Array<{ observe: ReturnType<typeof vi.fn>; disconnect: ReturnType<typeof vi.fn> }>;

const makeData = (overrides: Partial<BlickWaveformData> = {}): BlickWaveformData => ({
  bars: [10, 20],
  bands: new Float32Array([0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8]),
  sourceDurationSeconds: 2,
  loadingSegments: [],
  ...overrides,
});

const makeRenderer = (): BlickWaveformRenderer => ({ draw: vi.fn(), dispose: vi.fn() });

const flushAnimationFrames = () => {
  const frames = [...pendingFrames.entries()];
  pendingFrames.clear();
  for (const [, callback] of frames) callback(0);
};

const notifyResize = () => resizeCallback?.([] as ResizeObserverEntry[], {} as ResizeObserver);

beforeEach(() => {
  bounds = { width: 120, height: 40 };
  pendingFrames = new Map();
  nextFrameId = 0;
  resizeCallback = null;
  observers = [];
  acquireRenderer.mockReset();

  Object.defineProperty(window, 'matchMedia', {
    configurable: true,
    value: vi.fn(() => ({
      matches: true,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    })),
  });

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
  vi.spyOn(HTMLDivElement.prototype, 'getBoundingClientRect').mockImplementation(
    () => ({ width: bounds.width, height: bounds.height }) as DOMRect,
  );
});

afterEach(() => {
  Object.defineProperty(window, 'devicePixelRatio', { configurable: true, value: originalDevicePixelRatio });
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  if (originalMatchMediaDescriptor) Object.defineProperty(window, 'matchMedia', originalMatchMediaDescriptor);
  else Reflect.deleteProperty(window, 'matchMedia');
});

describe('BlickWaveformCanvas', () => {
  it('coalesces prop changes into one frame and draws the latest data', async () => {
    const renderer = makeRenderer();
    acquireRenderer.mockReturnValue(renderer);
    const wrapper = mount(BlickWaveformCanvas, { props: { ...makeData() } });

    await wrapper.setProps({ bars: [3, 8, 13], sourceDurationSeconds: 5 });
    await wrapper.setProps({ bands: new Float32Array(12), loadingSegments: [{ leftPercent: 20, widthPercent: 10 }] });
    await nextTick();

    expect(window.requestAnimationFrame).toHaveBeenCalledOnce();
    expect(pendingFrames.size).toBe(1);
    flushAnimationFrames();
    await nextTick();

    expect(acquireRenderer).toHaveBeenCalledOnce();
    expect(renderer.draw).toHaveBeenCalledOnce();
    expect(renderer.draw).toHaveBeenCalledWith(
      wrapper.get('.blick-waveform-current').get('.blick-waveform-canvas').element,
      expect.objectContaining({
        bars: [3, 8, 13],
        sourceDurationSeconds: 5,
        loadingSegments: [{ leftPercent: 20, widthPercent: 10 }],
      }),
      bounds.width,
      bounds.height,
    );
    wrapper.unmount();
  });

  it('waits while deferred, then draws the newest props once drawing resumes', async () => {
    const renderer = makeRenderer();
    acquireRenderer.mockReturnValue(renderer);
    const wrapper = mount(BlickWaveformCanvas, { props: { ...makeData(), deferDraw: true } });

    await wrapper.setProps({ bars: [4, 9, 15] });
    bounds = { width: 180, height: 52 };
    notifyResize();
    await nextTick();
    expect(window.requestAnimationFrame).not.toHaveBeenCalled();

    await wrapper.setProps({ deferDraw: false });
    await nextTick();
    expect(window.requestAnimationFrame).toHaveBeenCalledOnce();
    flushAnimationFrames();
    await nextTick();

    expect(renderer.draw).toHaveBeenCalledOnce();
    expect(renderer.draw).toHaveBeenCalledWith(
      wrapper.get('.blick-waveform-current').get('.blick-waveform-canvas').element,
      expect.objectContaining({ bars: [4, 9, 15] }),
      180,
      52,
    );
    wrapper.unmount();
  });

  it('keeps the painted range and pending overlays until deferred range data draws', async () => {
    const renderer = makeRenderer();
    acquireRenderer.mockReturnValue(renderer);
    const wrapper = mount(BlickWaveformCanvas, {
      props: {
        ...makeData({ loadingSegments: [{ leftPercent: 25, widthPercent: 15 }] }),
        leftPercent: 10,
        widthPercent: 70,
      },
    });
    flushAnimationFrames();
    await nextTick();

    let layer = wrapper.get('.blick-waveform-current');
    expect(layer.attributes('style')).toContain('left: 10%');
    expect(layer.attributes('style')).toContain('width: 70%');
    expect(wrapper.findAll('.waveform-segment-loading')).toHaveLength(1);
    expect(layer.get('.waveform-segment-loading').attributes('style')).toContain('left: 25%');
    expect(layer.get('.waveform-segment-loading').attributes('style')).toContain('width: 15%');

    await wrapper.setProps({
      deferDraw: true,
      bars: [12, 22, 32],
      bands: new Float32Array(12),
      loadingSegments: [{ leftPercent: 20, widthPercent: 50 }],
      leftPercent: 40,
      widthPercent: 30,
    });
    expect(renderer.draw).toHaveBeenCalledOnce();
    layer = wrapper.get('.blick-waveform-current');
    expect(layer.attributes('style')).toContain('left: 10%');
    expect(layer.attributes('style')).toContain('width: 70%');
    expect(layer.get('.waveform-segment-loading').attributes('style')).toContain('left: 25%');
    expect(layer.get('.waveform-segment-loading').attributes('style')).toContain('width: 15%');

    await wrapper.setProps({ deferDraw: false });
    expect(wrapper.get('.blick-waveform-current').attributes('style')).toContain('left: 10%');
    expect(wrapper.get('.blick-waveform-current').get('.waveform-segment-loading').attributes('style')).toContain(
      'left: 25%',
    );
    flushAnimationFrames();
    await nextTick();

    expect(renderer.draw).toHaveBeenCalledTimes(2);
    expect(renderer.draw).toHaveBeenLastCalledWith(
      wrapper.get('.blick-waveform-current').get('.blick-waveform-canvas').element,
      expect.objectContaining({ bars: [12, 22, 32], loadingSegments: [{ leftPercent: 20, widthPercent: 50 }] }),
      36,
      40,
    );
    layer = wrapper.get('.blick-waveform-current');
    expect(layer.attributes('style')).toContain('left: 40%');
    expect(layer.attributes('style')).toContain('width: 30%');
    expect(layer.get('.waveform-segment-loading').attributes('style')).toContain('left: 20%');
    expect(layer.get('.waveform-segment-loading').attributes('style')).toContain('width: 50%');
    wrapper.unmount();
  });

  it('preserves the last painted bitmap, range, and overlays when drawing fails', async () => {
    const renderer = makeRenderer();
    vi.mocked(renderer.draw)
      .mockImplementationOnce((target) => {
        target.width = 120;
        target.height = 40;
      })
      .mockImplementationOnce((target) => {
        target.width = 777;
        target.height = 333;
        throw new Error('Replacement draw failed.');
      });
    acquireRenderer.mockReturnValue(renderer);
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const wrapper = mount(BlickWaveformCanvas, {
      props: {
        ...makeData({ loadingSegments: [{ leftPercent: 10, widthPercent: 20 }] }),
        leftPercent: 15,
        widthPercent: 60,
      },
    });
    flushAnimationFrames();
    await nextTick();

    const displayedLayer = wrapper.get('.blick-waveform-current');
    const displayedCanvas = displayedLayer.get('.blick-waveform-canvas').element as HTMLCanvasElement;
    const bitmapSize = {
      width: displayedCanvas.width,
      height: displayedCanvas.height,
    };
    expect(bitmapSize).toEqual({ width: 120, height: 40 });

    await wrapper.setProps({
      bars: [3, 5, 8],
      bands: new Float32Array(12),
      loadingSegments: [{ leftPercent: 50, widthPercent: 25 }],
      leftPercent: 35,
      widthPercent: 30,
    });
    flushAnimationFrames();
    await nextTick();

    expect(wrapper.get('.waveform-error').attributes('title')).toBe('Replacement draw failed.');
    const currentLayer = wrapper.get('.blick-waveform-current');
    const currentCanvas = currentLayer.get('.blick-waveform-canvas').element as HTMLCanvasElement;
    const failedTarget = vi.mocked(renderer.draw).mock.calls[1]![0];
    expect(currentCanvas).toBe(displayedCanvas);
    expect(currentCanvas.width).toBe(bitmapSize.width);
    expect(currentCanvas.height).toBe(bitmapSize.height);
    expect(failedTarget).not.toBe(currentCanvas);
    expect(failedTarget.width).toBe(777);
    expect(failedTarget.height).toBe(333);
    expect(currentLayer.attributes('style')).toContain('left: 15%');
    expect(currentLayer.attributes('style')).toContain('width: 60%');
    expect(currentLayer.get('.waveform-segment-loading').attributes('style')).toContain('left: 10%');
    expect(currentLayer.get('.waveform-segment-loading').attributes('style')).toContain('width: 20%');
    wrapper.unmount();
  });

  it('cancels a scheduled frame when drawing is deferred again', async () => {
    const renderer = makeRenderer();
    acquireRenderer.mockReturnValue(renderer);
    const wrapper = mount(BlickWaveformCanvas, { props: { ...makeData() } });
    await nextTick();
    expect(pendingFrames.size).toBe(1);
    const queuedFrame = [...pendingFrames.values()][0]!;

    await wrapper.setProps({ deferDraw: true });
    await nextTick();
    expect(window.cancelAnimationFrame).toHaveBeenCalledOnce();
    expect(pendingFrames.size).toBe(0);
    queuedFrame(0);
    expect(acquireRenderer).not.toHaveBeenCalled();
    wrapper.unmount();
  });

  it('redraws on resize and skips zero-sized canvases until dimensions are available', async () => {
    const renderer = makeRenderer();
    acquireRenderer.mockReturnValue(renderer);
    bounds = { width: 0, height: 40 };
    const wrapper = mount(BlickWaveformCanvas, { props: { ...makeData() } });
    flushAnimationFrames();
    expect(acquireRenderer).not.toHaveBeenCalled();

    bounds = { width: 120, height: 0 };
    notifyResize();
    flushAnimationFrames();
    expect(acquireRenderer).not.toHaveBeenCalled();

    bounds = { width: 220, height: 64 };
    notifyResize();
    flushAnimationFrames();
    await nextTick();
    expect(renderer.draw).toHaveBeenCalledOnce();
    expect(renderer.draw).toHaveBeenCalledWith(
      wrapper.get('.blick-waveform-current').get('.blick-waveform-canvas').element,
      expect.anything(),
      220,
      64,
    );

    bounds = { width: 260, height: 70 };
    notifyResize();
    flushAnimationFrames();
    await nextTick();
    expect(renderer.draw).toHaveBeenCalledTimes(2);
    expect(renderer.draw).toHaveBeenLastCalledWith(
      wrapper.get('.blick-waveform-current').get('.blick-waveform-canvas').element,
      expect.anything(),
      260,
      70,
    );
    wrapper.unmount();
  });

  it('observes the waveform container and cancels pending work while releasing the renderer on unmount', async () => {
    const renderer = makeRenderer();
    acquireRenderer.mockReturnValue(renderer);
    const wrapper = mount(BlickWaveformCanvas, { props: { ...makeData() } });
    flushAnimationFrames();
    expect(renderer.draw).toHaveBeenCalledOnce();
    expect(observers[0]?.observe).toHaveBeenCalledWith(wrapper.get('.blick-waveform').element);

    notifyResize();
    expect(pendingFrames.size).toBe(1);
    const observer = observers[0]!;
    wrapper.unmount();

    expect(observer.disconnect).toHaveBeenCalledOnce();
    expect(window.cancelAnimationFrame).toHaveBeenCalledOnce();
    expect(pendingFrames.size).toBe(0);
    expect(renderer.dispose).toHaveBeenCalledOnce();
    flushAnimationFrames();
    expect(renderer.draw).toHaveBeenCalledOnce();
    const scheduledCount = vi.mocked(window.requestAnimationFrame).mock.calls.length;
    notifyResize();
    expect(window.requestAnimationFrame).toHaveBeenCalledTimes(scheduledCount);
  });

  it('shows a visible error when GPU initialization fails', async () => {
    acquireRenderer.mockImplementation(() => {
      throw new Error('WebGL2 is unavailable for audio waveforms.');
    });
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const wrapper = mount(BlickWaveformCanvas, { props: { ...makeData() } });
    flushAnimationFrames();
    await nextTick();

    const error = wrapper.get('.waveform-error');
    expect(error.text()).toBe('waveformUnavailable');
    expect(error.attributes('title')).toBe('WebGL2 is unavailable for audio waveforms.');
    expect(consoleError).toHaveBeenCalledWith('[Beam media:waveform]', expect.any(Error));
    wrapper.unmount();
  });

  it('shows a fallback message when drawing fails without an Error object', async () => {
    const renderer = makeRenderer();
    vi.mocked(renderer.draw).mockImplementation(() => {
      throw 'gpu failure';
    });
    acquireRenderer.mockReturnValue(renderer);
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const wrapper = mount(BlickWaveformCanvas, { props: { ...makeData() } });
    flushAnimationFrames();
    await nextTick();

    expect(wrapper.get('.waveform-error').attributes('title')).toBe('The audio waveform could not be rendered.');
    wrapper.unmount();
  });
});
