import { mount } from '@vue/test-utils';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { nextTick } from 'vue';
import type { BlickWaveformData, BlickWaveformRenderer } from '../blick-waveform-types';
import BlickWaveformCanvas from '../BlickWaveformCanvas.vue';
import { acquireBlickWaveformRenderer } from '../blick-waveform-renderer';

vi.mock('~/i18n/useTranslate', () => ({ useTranslate: () => ({ t: (key: string) => key }) }));
vi.mock('../blick-waveform-renderer', () => ({ acquireBlickWaveformRenderer: vi.fn() }));

const acquireRenderer = vi.mocked(acquireBlickWaveformRenderer);
const originalMatchMediaDescriptor = Object.getOwnPropertyDescriptor(window, 'matchMedia');
const originalAnimateDescriptor = Object.getOwnPropertyDescriptor(Element.prototype, 'animate');

type AnimationStub = {
  cancel: ReturnType<typeof vi.fn>;
  finish: ReturnType<typeof vi.fn<() => void>>;
  onfinish: ((this: Animation, event: AnimationPlaybackEvent) => void) | null;
};

type AnimationCall = {
  element: Element;
  keyframes: Keyframe[] | PropertyIndexedKeyframes;
  options?: number | KeyframeAnimationOptions;
};

let bounds = { width: 120, height: 40 };
let pendingFrames: Map<number, FrameRequestCallback>;
let nextFrameId: number;
let observers: Array<{ observe: ReturnType<typeof vi.fn>; disconnect: ReturnType<typeof vi.fn> }>;
let reducedMotion: boolean;
let motionChangeListener: EventListener | undefined;
let mediaQuery: MediaQueryList;
let animationStubs: AnimationStub[];
let animationCalls: AnimationCall[];
let animateMock: ReturnType<typeof vi.fn>;

const makeData = (overrides: Partial<BlickWaveformData> = {}): BlickWaveformData => ({
  bars: [10, 20],
  bands: new Float32Array([0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8]),
  sourceDurationSeconds: 2,
  loadingSegments: [],
  ...overrides,
});

const makeRenderer = (): BlickWaveformRenderer => ({
  draw: vi.fn((target: HTMLCanvasElement) => {
    target.width = bounds.width;
    target.height = bounds.height;
  }),
  dispose: vi.fn(),
});

const makeAnimation = (): Animation => {
  const animation: AnimationStub = {
    cancel: vi.fn(),
    finish: vi.fn(),
    onfinish: null,
  };
  animation.finish.mockImplementation(() =>
    animation.onfinish?.call(animation as unknown as Animation, {} as AnimationPlaybackEvent),
  );
  animationStubs.push(animation);
  return animation as unknown as Animation;
};

const flushAnimationFrames = () => {
  const frames = [...pendingFrames.entries()];
  pendingFrames.clear();
  for (const [, callback] of frames) callback(0);
};

const setReducedMotion = (matches: boolean) => {
  reducedMotion = matches;
  motionChangeListener?.(new Event('change'));
};

beforeEach(() => {
  bounds = { width: 120, height: 40 };
  pendingFrames = new Map();
  nextFrameId = 0;
  observers = [];
  reducedMotion = true;
  motionChangeListener = undefined;
  animationStubs = [];
  animationCalls = [];
  acquireRenderer.mockReset();

  mediaQuery = {
    get matches() {
      return reducedMotion;
    },
    media: '(prefers-reduced-motion: reduce)',
    onchange: null,
    addEventListener: vi.fn((_type: string, listener: EventListenerOrEventListenerObject) => {
      if (typeof listener === 'function') motionChangeListener = listener;
    }),
    removeEventListener: vi.fn((_type: string, listener: EventListenerOrEventListenerObject) => {
      if (listener === motionChangeListener) motionChangeListener = undefined;
    }),
  } as unknown as MediaQueryList;
  Object.defineProperty(window, 'matchMedia', { configurable: true, value: vi.fn(() => mediaQuery) });
  Object.defineProperty(Element.prototype, 'animate', {
    configurable: true,
    writable: true,
    value: vi.fn(function (
      this: Element,
      keyframes: Keyframe[] | PropertyIndexedKeyframes,
      options?: number | KeyframeAnimationOptions,
    ) {
      animationCalls.push({ element: this, keyframes, options });
      return makeAnimation();
    }),
  });
  animateMock = vi.mocked(Element.prototype.animate);

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

      constructor(_callback: ResizeObserverCallback) {
        observers.push(this);
      }
    },
  );
  vi.spyOn(HTMLDivElement.prototype, 'getBoundingClientRect').mockImplementation(
    () => ({ width: bounds.width, height: bounds.height }) as DOMRect,
  );
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  if (originalMatchMediaDescriptor) Object.defineProperty(window, 'matchMedia', originalMatchMediaDescriptor);
  else Reflect.deleteProperty(window, 'matchMedia');
  if (originalAnimateDescriptor) Object.defineProperty(Element.prototype, 'animate', originalAnimateDescriptor);
  else Reflect.deleteProperty(Element.prototype, 'animate');
});

describe('BlickWaveformCanvas replacement animation', () => {
  it('does not animate the initial frame or replacements involving pending or empty data', async () => {
    setReducedMotion(false);
    const renderer = makeRenderer();
    acquireRenderer.mockReturnValue(renderer);
    const wrapper = mount(BlickWaveformCanvas, { props: { ...makeData() } });
    flushAnimationFrames();
    await nextTick();
    expect(animateMock).not.toHaveBeenCalled();

    await wrapper.setProps({
      bars: [3, 5, 8],
      loadingSegments: [{ leftPercent: 20, widthPercent: 25 }],
      leftPercent: 10,
    });
    flushAnimationFrames();
    await nextTick();
    expect(animateMock).not.toHaveBeenCalled();

    await wrapper.setProps({ bars: [4, 7], loadingSegments: [], leftPercent: 25 });
    flushAnimationFrames();
    await nextTick();
    expect(animateMock).not.toHaveBeenCalled();

    await wrapper.setProps({ bars: [], leftPercent: 35 });
    flushAnimationFrames();
    await nextTick();
    expect(renderer.draw).toHaveBeenCalledTimes(4);
    expect(animateMock).not.toHaveBeenCalled();
    wrapper.unmount();
  });

  it('crossfades loaded replacements while both layer ranges remain intact until completion', async () => {
    setReducedMotion(false);
    const renderer = makeRenderer();
    acquireRenderer.mockReturnValue(renderer);
    const wrapper = mount(BlickWaveformCanvas, {
      props: { ...makeData(), leftPercent: 10, widthPercent: 70 },
    });
    flushAnimationFrames();
    await nextTick();
    expect(animateMock).not.toHaveBeenCalled();

    await wrapper.setProps({ bars: [3, 8, 13], leftPercent: 40, widthPercent: 30 });
    flushAnimationFrames();
    await nextTick();

    expect(animateMock).toHaveBeenCalledTimes(2);
    expect(animationCalls.map(({ options }) => options)).toEqual([
      { duration: 160, easing: 'cubic-bezier(0.22, 1, 0.36, 1)', fill: 'both' },
      { duration: 160, easing: 'cubic-bezier(0.22, 1, 0.36, 1)', fill: 'both' },
    ]);
    const currentLayer = wrapper.get('.blick-waveform-current');
    const outgoingLayer = wrapper
      .findAll('.blick-waveform-layer')
      .find((layer) => layer.element !== currentLayer.element)!;
    expect(animationCalls[0]?.element).toBe(currentLayer.element);
    expect(animationCalls[1]?.element).toBe(outgoingLayer.element);
    expect(animationCalls[0]?.keyframes).toEqual([{ opacity: 0 }, { opacity: 1 }]);
    expect(animationCalls[1]?.keyframes).toEqual([{ opacity: 1 }, { opacity: 0 }]);
    expect(currentLayer.attributes('style')).toContain('left: 40%');
    expect(currentLayer.attributes('style')).toContain('width: 30%');
    expect(outgoingLayer.attributes('style')).toContain('left: 10%');
    expect(outgoingLayer.attributes('style')).toContain('width: 70%');

    const outgoingCanvas = outgoingLayer.get('.blick-waveform-canvas').element as HTMLCanvasElement;
    expect(outgoingCanvas.width).toBe(120);
    expect(outgoingCanvas.height).toBe(40);
    animationStubs[1]!.finish();
    expect(animationStubs.every(({ cancel }) => cancel.mock.calls.length === 1)).toBe(true);
    expect(outgoingCanvas.width).toBe(1);
    expect(outgoingCanvas.height).toBe(1);
    wrapper.unmount();
  });

  it('coalesces prop changes during a fade and draws only the latest data after it finishes', async () => {
    setReducedMotion(false);
    const renderer = makeRenderer();
    acquireRenderer.mockReturnValue(renderer);
    const wrapper = mount(BlickWaveformCanvas, { props: { ...makeData() } });
    flushAnimationFrames();
    await nextTick();
    await wrapper.setProps({ bars: [3, 4], leftPercent: 20, widthPercent: 60 });
    flushAnimationFrames();
    await nextTick();
    expect(renderer.draw).toHaveBeenCalledTimes(2);
    expect(animateMock).toHaveBeenCalledTimes(2);

    await wrapper.setProps({ bars: [5], leftPercent: 35, widthPercent: 45 });
    await wrapper.setProps({
      bars: [8, 13, 21],
      bands: new Float32Array(12),
      sourceDurationSeconds: 7,
      leftPercent: 55,
      widthPercent: 25,
    });
    expect(renderer.draw).toHaveBeenCalledTimes(2);
    expect(pendingFrames.size).toBe(0);

    animationStubs[1]!.finish();
    expect(pendingFrames.size).toBe(1);
    flushAnimationFrames();
    await nextTick();

    expect(renderer.draw).toHaveBeenCalledTimes(3);
    expect(renderer.draw).toHaveBeenLastCalledWith(
      wrapper.get('.blick-waveform-current').get('.blick-waveform-canvas').element,
      expect.objectContaining({ bars: [8, 13, 21], sourceDurationSeconds: 7 }),
      30,
      40,
    );
    expect(wrapper.get('.blick-waveform-current').attributes('style')).toContain('left: 55%');
    expect(wrapper.get('.blick-waveform-current').attributes('style')).toContain('width: 25%');
    expect(animateMock).toHaveBeenCalledTimes(4);
    animationStubs[3]!.finish();
    wrapper.unmount();
  });

  it('finishes a fade when reduced motion turns on and publishes queued props without another animation', async () => {
    setReducedMotion(false);
    const renderer = makeRenderer();
    acquireRenderer.mockReturnValue(renderer);
    const wrapper = mount(BlickWaveformCanvas, { props: { ...makeData() } });
    flushAnimationFrames();
    await nextTick();
    await wrapper.setProps({ bars: [3, 5, 8], leftPercent: 20 });
    flushAnimationFrames();
    await nextTick();
    await wrapper.setProps({ bars: [11, 13, 17], leftPercent: 45, widthPercent: 40 });
    expect(renderer.draw).toHaveBeenCalledTimes(2);
    expect(pendingFrames.size).toBe(0);

    setReducedMotion(true);
    expect(animationStubs[0]!.cancel).toHaveBeenCalledOnce();
    expect(animationStubs[1]!.cancel).toHaveBeenCalledOnce();
    expect(pendingFrames.size).toBe(1);
    flushAnimationFrames();
    await nextTick();

    expect(renderer.draw).toHaveBeenCalledTimes(3);
    expect(renderer.draw).toHaveBeenLastCalledWith(
      wrapper.get('.blick-waveform-current').get('.blick-waveform-canvas').element,
      expect.objectContaining({ bars: [11, 13, 17] }),
      48,
      40,
    );
    expect(wrapper.get('.blick-waveform-current').attributes('style')).toContain('left: 45%');
    expect(animateMock).toHaveBeenCalledTimes(2);
    wrapper.unmount();
  });

  it('cancels active animations and releases observers and the renderer on unmount', async () => {
    setReducedMotion(false);
    const renderer = makeRenderer();
    acquireRenderer.mockReturnValue(renderer);
    const wrapper = mount(BlickWaveformCanvas, { props: { ...makeData() } });
    flushAnimationFrames();
    await nextTick();
    await wrapper.setProps({ bars: [3, 8, 13] });
    flushAnimationFrames();
    await nextTick();
    const observer = observers[0]!;

    wrapper.unmount();

    expect(animationStubs).toHaveLength(2);
    expect(animationStubs[0]!.cancel).toHaveBeenCalledOnce();
    expect(animationStubs[1]!.cancel).toHaveBeenCalledOnce();
    expect(mediaQuery.removeEventListener).toHaveBeenCalledOnce();
    expect(observer.disconnect).toHaveBeenCalledOnce();
    expect(renderer.dispose).toHaveBeenCalledOnce();
  });
});
