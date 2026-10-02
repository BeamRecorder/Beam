import { mount } from '@vue/test-utils';
import { toRaw } from 'vue';
import { afterEach, describe, expect, it, vi } from 'vitest';
import TimelineCanvasLane from '../TimelineCanvasLane.vue';
import type { TimelineCanvasArtwork } from '../timeline-canvas-types';

const runtime = vi.hoisted(() => ({ paint: vi.fn() }));
vi.mock('../timeline-canvas-paint', () => ({ paintTimelineCanvas: runtime.paint }));
const props = {
  items: [],
  width: 6000,
  durationMs: 60000,
  viewport: { left: 0, top: 0, width: 1000, height: 320 },
};
const setup = (parentMargin = 0) => {
  const colors: Record<string, string> = {
    '--color-bg-field': '#111',
    '--text-primary': '#fff',
    '--color-timeline-item-border': '#555',
    '--color-timeline-selection': '#ddd',
    '--color-track-video': '#008',
    '--color-track-annotation': '#808',
    '--color-track-blur': '#800',
    '--color-track-audio': '#080',
    '--color-track-cursor': '#880',
    '--color-timeline-media-label': '#222',
    '--color-timeline-media-label-text': '#eee',
    '--text-secondary': '#aaa',
    '--radius-sm': '6px',
    '--timeline-item-tint': '36%',
    '--timeline-disabled-opacity': '0.3',
    '--timeline-effect-item-inset': '6px',
    '--timeline-effect-item-height': '36px',
  };
  vi.spyOn(window, 'getComputedStyle').mockReturnValue({
    marginLeft: `${parentMargin}px`,
    getPropertyValue: (key: string) => (key === 'margin-left' ? `${parentMargin}px` : (colors[key] ?? '')),
  } as unknown as CSSStyleDeclaration);
  let draw: FrameRequestCallback | null = null;
  let mutation: MutationCallback;
  let resized: ResizeObserverCallback;
  const disconnect = vi.fn(),
    resizeDisconnect = vi.fn();
  vi.stubGlobal(
    'MutationObserver',
    class {
      constructor(cb: MutationCallback) {
        mutation = cb;
      }
      observe = vi.fn();
      disconnect = disconnect;
    },
  );
  vi.stubGlobal(
    'ResizeObserver',
    class {
      constructor(cb: ResizeObserverCallback) {
        resized = cb;
      }
      observe = vi.fn();
      disconnect = resizeDisconnect;
    },
  );
  const raf = vi.spyOn(window, 'requestAnimationFrame').mockImplementation((cb) => {
    draw = cb;
    return 1;
  });
  const cancel = vi.spyOn(window, 'cancelAnimationFrame').mockImplementation(() => {});
  const ctx = { setTransform: vi.fn() };
  const get = vi
    .spyOn(HTMLCanvasElement.prototype, 'getContext')
    .mockReturnValue(ctx as unknown as CanvasRenderingContext2D);
  vi.spyOn(HTMLCanvasElement.prototype, 'clientHeight', 'get').mockReturnValue(32);
  vi.spyOn(window, 'devicePixelRatio', 'get').mockReturnValue(3);
  const flush = () => {
    const cb = draw;
    draw = null;
    cb?.(0);
  };
  return {
    ctx,
    get,
    raf,
    cancel,
    flush,
    disconnect,
    resizeDisconnect,
    theme: () => mutation!([], {} as MutationObserver),
    resize: () => resized!([], {} as ResizeObserver),
    colors,
  };
};
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  runtime.paint.mockClear();
});
describe('viewport-sized canvas lane lifecycle', () => {
  it('coalesces changes and paints at full DPR without allocating timeline-width pixels', async () => {
    const state = setup(),
      wrapper = mount(TimelineCanvasLane, { props });
    await wrapper.setProps({ viewport: { ...props.viewport, left: 123 } });
    state.theme();
    state.resize();
    window.dispatchEvent(new Event('resize'));
    expect(state.raf).toHaveBeenCalledOnce();
    state.flush();
    const canvas = wrapper.get('canvas').element;
    expect([canvas.width, canvas.height]).toEqual([3576, 96]);
    expect(state.ctx.setTransform).toHaveBeenCalledWith(3, 0, 0, 3, 0, 0);
    expect(runtime.paint.mock.calls[0]?.[2]).toMatchObject({ left: 27, viewportWidth: 1192, height: 32 });
    await wrapper.setProps({ width: 6001 });
    state.flush();
    expect(runtime.paint).toHaveBeenCalledTimes(2);
    state.theme();
    wrapper.unmount();
    expect(state.cancel.mock.calls.filter(([id]) => id !== 0)).toEqual([[1]]);
    expect(state.disconnect).toHaveBeenCalledOnce();
    expect(state.resizeDisconnect).toHaveBeenCalledOnce();
  });
  it('does no painting for an empty viewport and releases a completed frame without cancelling it', () => {
    const state = setup(),
      wrapper = mount(TimelineCanvasLane, { props: { ...props, width: 0 } });
    state.flush();
    expect(state.get).not.toHaveBeenCalled();
    wrapper.unmount();
    expect(state.cancel.mock.calls.filter(([id]) => id !== 0)).toEqual([]);
  });
  it('reports an unavailable context explicitly and supports a default DPR', () => {
    const state = setup();
    vi.spyOn(window, 'devicePixelRatio', 'get').mockReturnValue(0);
    const wrapper = mount(TimelineCanvasLane, { props });
    state.get.mockReturnValueOnce(null);
    expect(state.flush).toThrow('context unavailable');
    state.theme();
    state.flush();
    expect(wrapper.get('canvas').element.width).toBe(1192);
    wrapper.unmount();
  });

  it('reads actual palette tokens and publishes a newly ready artwork map without an idle animation loop', async () => {
    const state = setup(),
      first = new Map<string, TimelineCanvasArtwork>();
    const wrapper = mount(TimelineCanvasLane, { props: { ...props, artworks: first } });
    state.flush();
    expect(runtime.paint.mock.calls[0]?.[3]).toMatchObject({
      background: '#111',
      audio: '#080',
      zoom: '#880',
      highlight: '#808',
      radius: 6,
      tint: 0.36,
      disabledOpacity: 0.3,
      labelBackground: '#222',
      labelText: '#eee',
      curve: '#aaa',
      effectInset: 6,
      effectHeight: 36,
    });
    expect(toRaw(runtime.paint.mock.calls[0]?.[4])).toBe(first);
    const ready = new Map<string, TimelineCanvasArtwork>([['clip', { kind: 'thumbnails', frames: [] }]]);
    await wrapper.setProps({ artworks: ready });
    state.flush();
    expect(toRaw(runtime.paint.mock.calls[1]?.[4])).toBe(ready);
    state.colors['--radius-sm'] = '9px';
    state.colors['--timeline-item-tint'] = '48%';
    state.colors['--timeline-effect-item-inset'] = '4px';
    state.colors['--timeline-effect-item-height'] = '28px';
    state.theme();
    state.flush();
    expect(runtime.paint.mock.calls[2]?.[3]).toMatchObject({ radius: 9, tint: 0.48, effectInset: 4, effectHeight: 28 });
    expect(state.raf).toHaveBeenCalledTimes(3);
    wrapper.unmount();
  });

  it('commits canvas position, CSS width and backing pixels with the matching paint, never ahead of it', async () => {
    const state = setup(),
      wrapper = mount(TimelineCanvasLane, { props });
    state.flush();
    const canvas = wrapper.get('canvas').element;
    expect(canvas.style.left).toBe('0px');
    expect(canvas.style.width).toBe('1192px');
    expect(canvas.width).toBe(3576);

    await wrapper.setProps({ viewport: { ...props.viewport, left: 240, width: 640 } });
    expect(runtime.paint).toHaveBeenCalledTimes(1);
    expect(canvas.style.left).toBe('0px');
    expect(canvas.style.width).toBe('1192px');
    expect(canvas.width).toBe(3576);
    await wrapper.setProps({ viewport: { ...props.viewport, left: 384, width: 720 } });
    expect(state.raf).toHaveBeenCalledTimes(2);
    expect(canvas.style.left).toBe('0px');
    expect(canvas.style.width).toBe('1192px');

    state.flush();
    expect(runtime.paint.mock.calls[1]?.[2]).toMatchObject({ left: 288, viewportWidth: 912 });
    expect(canvas.style.left).toBe('288px');
    expect(canvas.style.width).toBe('912px');
    expect(canvas.width).toBe(2736);
    wrapper.unmount();
  });

  it('subtracts the parent gutter and keeps overscan on the visible left edge without a permanent blank band', async () => {
    const state = setup(80),
      wrapper = mount(TimelineCanvasLane, { props });
    state.flush();
    const canvas = wrapper.get('canvas').element;
    expect(canvas.style.left).toBe('0px');
    await wrapper.setProps({ viewport: { ...props.viewport, left: 60 } });
    state.flush();
    expect(runtime.paint.mock.calls[1]?.[2]).toMatchObject({ left: 0, viewportWidth: 1192 });
    await wrapper.setProps({ viewport: { ...props.viewport, left: 240 } });
    expect(canvas.style.left).toBe('0px');
    state.flush();
    expect(runtime.paint.mock.calls[2]?.[2]).toMatchObject({ left: 64, viewportWidth: 1192 });
    expect(canvas.style.left).toBe('64px');
    expect(Number.parseFloat(canvas.style.left) + 80 - 240).toBe(-96);
    expect(canvas.width).toBeLessThanOrEqual((props.viewport.width + 192) * 3);
    wrapper.unmount();
  });

  it('bounds overscan to the remaining document and never allocates beyond a short timeline', async () => {
    const state = setup(80),
      wrapper = mount(TimelineCanvasLane, { props });
    state.flush();
    await wrapper.setProps({ viewport: { ...props.viewport, left: 5900 } });
    state.flush();
    const canvas = wrapper.get('canvas').element;
    expect(runtime.paint.mock.calls[1]?.[2]).toMatchObject({ left: 5724, viewportWidth: 276 });
    expect(canvas.style.width).toBe('276px');
    expect(canvas.width).toBe(828);
    await wrapper.setProps({ width: 500, viewport: props.viewport });
    state.flush();
    expect(runtime.paint.mock.calls[2]?.[2]).toMatchObject({ left: 0, width: 500, viewportWidth: 500 });
    expect(canvas.width).toBe(1500);
    wrapper.unmount();
  });
});
