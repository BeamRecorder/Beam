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
    setTransform: vi.fn(),
    lineCap: '',
    lineJoin: '',
    strokeStyle: '',
    fillStyle: '',
    lineWidth: 0,
    globalAlpha: 1,
  }) as unknown as CanvasRenderingContext2D;

describe('MiniPerformanceGraph', () => {
  let context: CanvasRenderingContext2D;
  let getContext: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    context = createContext();
    getContext = vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(context);
    Object.defineProperty(window, 'devicePixelRatio', { configurable: true, value: 2 });
  });

  afterEach(() => {
    getContext.mockRestore();
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
});
