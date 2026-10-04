import { mount, enableAutoUnmount } from '@vue/test-utils';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { defineComponent, h, nextTick, ref, withDirectives } from 'vue';
import {
  createCanvasControlContrast,
  provideCanvasControlContrast,
  useCanvasControlContrast,
} from './useCanvasControlContrast';
import type { CanvasControlContrast } from './canvas-control-contrast-types';
enableAutoUnmount(afterEach);
let frames: Map<number, FrameRequestCallback>, sequence: number;
let data: Uint8ClampedArray;
const context = { clearRect: vi.fn(), drawImage: vi.fn(), getImageData: vi.fn() };
const advance = (time: number) => {
  const pending = [...frames.values()];
  frames.clear();
  pending.forEach((callback) => callback(time));
};
const sample = (sampler: CanvasControlContrast, time: number) => {
  sampler.refresh();
  advance(time);
};
const fixture = () => {
  const source = document.createElement('canvas');
  source.width = 1920;
  source.height = 1080;
  vi.spyOn(source, 'getBoundingClientRect').mockReturnValue({
    left: 100,
    top: 100,
    width: 1000,
    height: 500,
  } as DOMRect);
  const control = document.createElement('button');
  vi.spyOn(control, 'getBoundingClientRect').mockReturnValue({ left: 595, top: 345, width: 10, height: 10 } as DOMRect);
  return { source, control };
};
beforeEach(() => {
  vi.useFakeTimers();
  frames = new Map();
  sequence = 0;
  vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
    frames.set(++sequence, callback);
    return sequence;
  });
  vi.stubGlobal('cancelAnimationFrame', (id: number) => {
    frames.delete(id);
  });
  vi.clearAllMocks();
  data = new Uint8ClampedArray(64 * 64 * 4).fill(255);
  context.getImageData.mockImplementation(() => ({ width: 64, height: 64, data }));
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(context as unknown as CanvasRenderingContext2D);
});
afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});
describe('shared canvas control sampling', () => {
  it('uses one identical tone for points above contrasting portions of the canvas', () => {
    const s = fixture(),
      second = fixture().control;
    vi.spyOn(s.control, 'getBoundingClientRect').mockReturnValue({
      left: 295,
      top: 345,
      width: 10,
      height: 10,
    } as DOMRect);
    vi.spyOn(second, 'getBoundingClientRect').mockReturnValue({
      left: 895,
      top: 345,
      width: 10,
      height: 10,
    } as DOMRect);
    for (let row = 0; row < 64; row++)
      for (let col = 0; col < 32; col++) {
        const i = (row * 64 + col) * 4;
        data[i] = data[i + 1] = data[i + 2] = 0;
      }
    const sampler = createCanvasControlContrast(() => s.source);
    sampler.register(s.control);
    sampler.register(second);
    advance(0);
    expect(s.control.style.getPropertyValue('--canvas-control-ink')).toBe('var(--canvas-control-dark)');
    expect(second.style.cssText).toBe(s.control.style.cssText);
    sampler.dispose();
  });
  it('samples one tiny bitmap for every control at no more than eight times a second', () => {
    const s = fixture(),
      sampler = createCanvasControlContrast(() => s.source);
    const release = sampler.register(s.control);
    sampler.register(s.control);
    const second = fixture().control;
    sampler.register(second);
    advance(0);
    expect(context.drawImage).toHaveBeenCalledWith(s.source, 0, 0, 64, 64);
    expect(context.getImageData).toHaveBeenCalledOnce();
    expect(s.control.style.getPropertyValue('--canvas-control-ink')).toBe('var(--canvas-control-dark)');
    expect(second.style.getPropertyValue('--canvas-control-halo')).toBe('var(--text-light)');
    sampler.refresh();
    advance(100);
    expect(context.getImageData).toHaveBeenCalledOnce();
    vi.advanceTimersByTime(25);
    advance(125);
    expect(context.getImageData).toHaveBeenCalledTimes(2);
    sampler.refresh();
    advance(130);
    expect(vi.getTimerCount()).toBe(1);
    release();
    sampler.dispose();
    expect(frames.size).toBe(0);
  });
  it('adapts to changed artwork and clears sampled values for transparent or outside pixels', () => {
    const s = fixture(),
      sampler = createCanvasControlContrast(() => s.source);
    sampler.register(s.control);
    advance(0);
    data = new Uint8ClampedArray(Array.from({ length: 64 * 64 }, () => [0, 0, 0, 255]).flat());
    sample(sampler, 125);
    expect(s.control.style.getPropertyValue('--canvas-control-ink')).toBe('var(--text-light)');
    expect(s.control.style.getPropertyValue('--canvas-control-halo')).toBe('var(--canvas-control-dark)');
    data.fill(0);
    sample(sampler, 250);
    expect(s.control.style.getPropertyValue('--canvas-control-ink')).toBe('');
    data.fill(255);
    sample(sampler, 375);
    vi.spyOn(s.control, 'getBoundingClientRect').mockReturnValue({
      left: 2000,
      top: 2000,
      width: 10,
      height: 10,
    } as DOMRect);
    sample(sampler, 500);
    expect(s.control.style.getPropertyValue('--canvas-control-ink')).toBe('');
    sampler.dispose();
  });
  it('does no sampling without controls or for unready and unmeasured canvases', () => {
    const s = fixture();
    let source: HTMLCanvasElement | null = null;
    const sampler = createCanvasControlContrast(() => source);
    advance(0);
    expect(frames.size).toBe(0);
    const release = sampler.register(s.control);
    sample(sampler, 125);
    source = s.source;
    source.width = 0;
    sample(sampler, 250);
    source.width = 1000;
    source.height = 0;
    sample(sampler, 375);
    source.height = 500;
    vi.spyOn(source, 'getBoundingClientRect').mockReturnValue({ width: 0, height: 0 } as DOMRect);
    sample(sampler, 500);
    expect(context.drawImage).not.toHaveBeenCalled();
    release();
    expect(frames.size).toBe(0);
    // A queued callback after unregister must not restart the sampler.
    const next = sampler.register(s.control),
      callback = [...frames.values()][0]!;
    next();
    callback(625);
    expect(frames.size).toBe(0);
  });
  it('stops readback for a tainted canvas and resumes for a new preview surface', () => {
    let source = fixture().source;
    const s = fixture(),
      sampler = createCanvasControlContrast(() => source);
    context.getImageData.mockImplementationOnce(() => {
      throw new DOMException('Tainted canvas', 'SecurityError');
    });
    sampler.register(s.control);
    advance(0);
    sample(sampler, 125);
    expect(context.getImageData).toHaveBeenCalledOnce();
    source = s.source;
    sample(sampler, 250);
    expect(context.getImageData).toHaveBeenCalledTimes(2);
    sampler.dispose();
  });
  it('retains neutral controls when canvas readback is unavailable', () => {
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null);
    const s = fixture(),
      sampler = createCanvasControlContrast(() => s.source);
    sampler.register(s.control);
    advance(0);
    expect(context.drawImage).not.toHaveBeenCalled();
    sampler.dispose();
  });
  it('registers directives within the editor and disposes them on unmount', async () => {
    const s = fixture();
    const label = ref('Anchor');
    const Child = defineComponent({
      setup() {
        const directive = useCanvasControlContrast();
        return () => withDirectives(h('button', label.value), [[directive]]);
      },
    });
    const wrapper = mount(
      defineComponent({
        setup() {
          provideCanvasControlContrast(() => s.source);
          return () => h(Child);
        },
      }),
    );
    vi.spyOn(wrapper.get('button').element, 'getBoundingClientRect').mockReturnValue({
      left: 600,
      top: 350,
      width: 10,
      height: 10,
    } as DOMRect);
    advance(0);
    expect(wrapper.get('button').attributes('style')).toContain('--canvas-control-ink');
    label.value = 'Moved anchor';
    await nextTick();
    advance(125);
    expect(context.getImageData).toHaveBeenCalledTimes(2);
    wrapper.unmount();
    expect(frames.size).toBe(0);
    const empty = mount(Child);
    expect(empty.get('button').attributes('style')).toBeUndefined();
    label.value = 'Another anchor';
    await nextTick();
    expect(frames.size).toBe(0);
  });
});
