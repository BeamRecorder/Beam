import { nextTick } from 'vue';
import { mount } from '@vue/test-utils';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import MiniPerformanceGraph from './MiniPerformanceGraph.vue';

const createContext = () =>
  ({
    clearRect: vi.fn(),
    beginPath: vi.fn(),
    moveTo: vi.fn(),
    lineTo: vi.fn(),
    quadraticCurveTo: vi.fn(),
    bezierCurveTo: vi.fn(),
    closePath: vi.fn(),
    stroke: vi.fn(),
    fill: vi.fn(),
    arc: vi.fn(),
    save: vi.fn(),
    restore: vi.fn(),
    setLineDash: vi.fn(),
    setTransform: vi.fn(),
    lineCap: '',
    lineJoin: '',
    strokeStyle: '',
    fillStyle: '',
    lineWidth: 0,
    globalAlpha: 1,
  }) as unknown as CanvasRenderingContext2D;

type RafController = {
  pending: Map<number, FrameRequestCallback>;
  request: (callback: FrameRequestCallback) => number;
  cancel: (id: number) => void;
  run: (timestamp: number) => void;
  clear: () => void;
};

const createRafController = (): RafController => {
  let nextId = 1;
  const pending = new Map<number, FrameRequestCallback>();

  return {
    pending,
    request: (callback) => {
      const id = nextId++;
      pending.set(id, callback);
      return id;
    },
    cancel: (id) => {
      pending.delete(id);
    },
    run: (timestamp) => {
      const next = pending.keys().next();
      if (next.done) return;
      const callback = pending.get(next.value);
      pending.delete(next.value);
      callback?.(timestamp);
    },
    clear: () => {
      pending.clear();
    },
  };
};

describe('MiniPerformanceGraph', () => {
  let context: CanvasRenderingContext2D;
  let getContext: ReturnType<typeof vi.spyOn>;
  let rafController: RafController;

  beforeEach(() => {
    context = createContext();
    getContext = vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(context);
    Object.defineProperty(window, 'devicePixelRatio', { configurable: true, value: 2 });
    rafController = createRafController();
    vi.spyOn(window, 'requestAnimationFrame').mockImplementation(rafController.request);
    vi.spyOn(window, 'cancelAnimationFrame').mockImplementation(rafController.cancel);
  });

  afterEach(() => {
    rafController.clear();
    vi.restoreAllMocks();
  });

  it('draws one finite clamped curve at the device pixel ratio', () => {
    const wrapper = mount(MiniPerformanceGraph, {
      props: {
        label: 'Preview performance',
        width: 80,
        height: 24,
        values: [-1, 0.5, 2, Number.NaN],
        color: '#fff',
      },
    });

    const canvas = wrapper.get('canvas').element as HTMLCanvasElement;
    expect(canvas.width).toBe(160);
    expect(canvas.height).toBe(48);
    expect(canvas.style.width).toBe('80px');
    expect(canvas.style.height).toBe('24px');
    expect(canvas.getAttribute('role')).toBe('img');
    expect(canvas.getAttribute('aria-label')).toBe('Preview performance');
    expect(context.setTransform).toHaveBeenCalledWith(2, 0, 0, 2, 0, 0);
    expect(context.clearRect).toHaveBeenCalledWith(0, 0, 80, 24);
    expect(context.stroke).toHaveBeenCalledTimes(1);
    expect(context.fill).toHaveBeenCalledTimes(1);
    expect(
      vi.mocked(context.quadraticCurveTo).mock.calls.length + vi.mocked(context.bezierCurveTo).mock.calls.length,
    ).toBeGreaterThan(0);
    expect(context.moveTo).toHaveBeenCalledWith(0, 22.5);
  });

  it('renders an empty graph without attempting to stroke a path', () => {
    mount(MiniPerformanceGraph, {
      props: { label: 'No samples', values: [], color: '#fff' },
    });

    expect(context.clearRect).toHaveBeenCalled();
    expect(context.stroke).not.toHaveBeenCalled();
  });

  it('uses a minimum backing size for zero geometry', () => {
    const wrapper = mount(MiniPerformanceGraph, {
      props: { label: 'Small graph', width: 0, height: 0, values: [], color: '#fff' },
    });

    const canvas = wrapper.get('canvas').element as HTMLCanvasElement;
    expect(canvas.width).toBe(1);
    expect(canvas.height).toBe(1);
  });

  it('tolerates a browser without a 2D canvas context', async () => {
    getContext.mockReturnValue(null);

    expect(() =>
      mount(MiniPerformanceGraph, {
        props: { label: 'Unavailable graph', values: [0.5], color: '#fff' },
      }),
    ).not.toThrow();
    await nextTick();
  });

  it('redraws when samples change', async () => {
    const wrapper = mount(MiniPerformanceGraph, {
      props: { label: 'Live graph', values: [0.1], color: '#fff', animationMs: 0 },
    });
    const clearCalls = vi.mocked(context.clearRect).mock.calls.length;

    await wrapper.setProps({ values: [0.1, 0.9] });
    await nextTick();

    expect(vi.mocked(context.clearRect).mock.calls.length).toBeGreaterThan(clearCalls);
    expect(context.stroke).toHaveBeenCalledTimes(2);
    expect(context.fill).toHaveBeenCalledTimes(2);
  });

  it('keeps a fixed sample window so adding a sample does not redistribute existing peaks', async () => {
    const wrapper = mount(MiniPerformanceGraph, {
      props: {
        label: 'Fixed window graph',
        width: 100,
        height: 24,
        values: [0.1, 1, 0.2, 0.4],
        color: '#fff',
        animationMs: 0,
        sampleCapacity: 4,
      },
    });
    const initialCalls = vi.mocked(context.bezierCurveTo).mock.calls;
    const initialPeakEndpoint = initialCalls[0]?.[4];
    const callsBeforeUpdate = initialCalls.length;

    await wrapper.setProps({ values: [0.1, 1, 0.2, 0.4, 0.9] });
    await nextTick();

    const calls = vi.mocked(context.bezierCurveTo).mock.calls;
    const updateCalls = calls.slice(callsBeforeUpdate);
    const latestPeakEndpoint = updateCalls[0]?.[4];
    expect(updateCalls).toHaveLength(3);
    expect(latestPeakEndpoint).toBe(initialPeakEndpoint);
    expect(updateCalls.every((call) => Number(call[4]) >= 0 && Number(call[4]) <= 100)).toBe(true);
  });

  it('animates the window at a constant speed instead of easing into a visible tick', async () => {
    const now = vi.spyOn(performance, 'now').mockReturnValue(0);

    const wrapper = mount(MiniPerformanceGraph, {
      props: {
        label: 'Uniform graph',
        width: 100,
        height: 24,
        values: [0.1, 0.2, 0.3],
        color: '#fff',
        animationMs: 500,
        sampleCapacity: 3,
      },
    });

    await wrapper.setProps({ values: [0.2, 0.3, 0.4] });
    await nextTick();
    // One frame is queued by the initial mount and replaced by the update frame.
    expect(window.requestAnimationFrame).toHaveBeenCalledTimes(2);

    now.mockReturnValue(250);
    rafController.run(250);

    const calls = vi.mocked(context.bezierCurveTo).mock.calls;
    const midpointFrame = calls.slice(-2);
    // At 50% of the transition, the first visible point has moved exactly half
    // a sample slot. An ease-out curve moves it almost all the way immediately.
    expect(midpointFrame[0]?.[4]).toBeCloseTo(25, 5);

    wrapper.unmount();
  });

  it('animates the initial sample window fill so peaks do not reflow on every early tick', async () => {
    const now = vi.spyOn(performance, 'now').mockReturnValue(0);

    const wrapper = mount(MiniPerformanceGraph, {
      props: {
        label: 'Growing graph',
        width: 100,
        height: 24,
        values: [0.1, 1, 0.2],
        color: '#fff',
        animationMs: 500,
        sampleCapacity: 4,
      },
    });

    await wrapper.setProps({ values: [0.1, 1, 0.2, 0.4] });
    await nextTick();

    // The first mount frame is cancelled and replaced by the frame for the new sample.
    expect(window.requestAnimationFrame).toHaveBeenCalledTimes(2);
    const sampleSpacing = 100 / 3;
    const startFrame = vi.mocked(context.bezierCurveTo).mock.calls.slice(-3);
    expect(startFrame.map((call) => Number(call[4]))).toEqual([
      expect.closeTo(sampleSpacing),
      expect.closeTo(sampleSpacing * 2),
      expect.closeTo(100),
    ]);

    now.mockReturnValue(250);
    rafController.run(250);

    const midpointFrame = vi.mocked(context.bezierCurveTo).mock.calls.slice(-3);
    const midpointX = midpointFrame.map((call) => Number(call[4]));
    expect(midpointX).toEqual([
      expect.closeTo(sampleSpacing / 2),
      expect.closeTo(sampleSpacing * 1.5),
      expect.closeTo(sampleSpacing * 2.5),
    ]);
    expect(midpointX[1]! - midpointX[0]!).toBeCloseTo(sampleSpacing, 5);
    expect(midpointX[2]! - midpointX[1]!).toBeCloseTo(sampleSpacing, 5);

    wrapper.unmount();
  });

  it('uses sample timestamps to keep visual state when only the values identity or style changes', async () => {
    const now = vi.spyOn(performance, 'now').mockReturnValue(0);
    const values = [0.1, 0.4, 0.2, 0.9];

    const wrapper = mount(MiniPerformanceGraph, {
      props: {
        label: 'Timestamped graph',
        width: 100,
        height: 24,
        values,
        color: '#fff',
        fill: true,
        animationMs: 500,
        sampleCapacity: 4,
        sampleTimestamp: 100,
      },
    });

    // Advance the active animation so a restart would be observable as a jump.
    rafController.run(125);
    const pendingBeforeEquivalentUpdate = [...rafController.pending.keys()];
    const requestCountBeforeEquivalentUpdate = vi.mocked(window.requestAnimationFrame).mock.calls.length;
    const cancelCountBeforeEquivalentUpdate = vi.mocked(window.cancelAnimationFrame).mock.calls.length;

    await wrapper.setProps({
      values: [...values],
      color: '#f00',
      fill: false,
      sampleTimestamp: 100,
    });
    await nextTick();

    expect(vi.mocked(window.requestAnimationFrame).mock.calls.length).toBe(requestCountBeforeEquivalentUpdate);
    expect(vi.mocked(window.cancelAnimationFrame).mock.calls.length).toBe(cancelCountBeforeEquivalentUpdate);
    expect([...rafController.pending.keys()]).toEqual(pendingBeforeEquivalentUpdate);

    await wrapper.setProps({ values: [...values], sampleTimestamp: 600 });
    await nextTick();

    expect(vi.mocked(window.cancelAnimationFrame).mock.calls.length).toBe(cancelCountBeforeEquivalentUpdate + 1);
    expect(vi.mocked(window.requestAnimationFrame).mock.calls.length).toBe(requestCountBeforeEquivalentUpdate + 1);
    expect(rafController.pending.size).toBe(1);

    wrapper.unmount();
    now.mockRestore();
  });

  it('renders a flat line across full width when given a single sample', () => {
    mount(MiniPerformanceGraph, {
      props: {
        label: 'Single sample',
        width: 80,
        height: 20,
        values: [0.5],
        color: '#fff',
        sampleCapacity: 1,
      },
    });

    expect(context.moveTo).toHaveBeenCalledWith(0, expect.any(Number));
    expect(context.lineTo).toHaveBeenCalledWith(80, expect.any(Number));
    expect(context.stroke).toHaveBeenCalled();
  });

  it('renders a curve-following cursor and top-right FPS badge on interactive hover', async () => {
    const wrapper = mount(MiniPerformanceGraph, {
      props: {
        label: 'Interactive graph',
        width: 100,
        height: 24,
        values: [0.0, 0.5, 1.0],
        color: '#fff',
        interactive: true,
        animationMs: 0,
      },
    });

    const canvas = wrapper.get('canvas').element as HTMLCanvasElement;
    vi.spyOn(canvas, 'getBoundingClientRect').mockReturnValue({
      left: 0,
      top: 0,
      width: 100,
      height: 24,
      right: 100,
      bottom: 24,
      x: 0,
      y: 0,
      toJSON: () => ({}),
    });

    const root = wrapper.get('.mini-performance-graph-wrapper');
    await root.trigger('pointermove', { clientX: 50 });
    await nextTick();

    const badge = wrapper.get('.mini-performance-graph-hover-badge');
    expect(badge.classes()).toContain('is-visible');
    expect(badge.text()).toMatch(/^\d+\.\d fps$/);

    // Context should have drawn the hover guideline and tracker arc
    expect(context.arc).toHaveBeenCalledWith(expect.any(Number), expect.any(Number), 2.5, 0, Math.PI * 2);

    await root.trigger('pointerleave');
    await nextTick();
    expect(wrapper.get('.mini-performance-graph-hover-badge').classes()).not.toContain('is-visible');
  });
});
