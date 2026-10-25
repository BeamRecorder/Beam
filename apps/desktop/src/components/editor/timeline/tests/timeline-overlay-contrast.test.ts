import { afterEach, describe, expect, it, vi } from 'vitest';
import { defineComponent, h, provide, ref, withDirectives } from 'vue';
import { enableAutoUnmount, mount } from '@vue/test-utils';
import { createTimelineOverlayContrast, useTimelineOverlayContrast } from '../timeline-overlay-contrast';
import { TIMELINE_OVERLAY_CONTRAST_KEY } from '../timeline-overlay-contrast-types';

enableAutoUnmount(afterEach);
afterEach(() => {
  vi.restoreAllMocks();
  vi.useRealTimers();
});
function fixture(bright = true) {
  let time = 0;
  vi.spyOn(performance, 'now').mockImplementation(() => time);
  const data = new Uint8ClampedArray(64 * 64 * 4);
  for (let i = 0; i < data.length; i += 4) data.set([bright ? 255 : 0, bright ? 255 : 0, bright ? 255 : 0, 255], i);
  const ctx = {
    setTransform: vi.fn(),
    clearRect: vi.fn(),
    getImageData: vi.fn(() => ({ width: 64, height: 64, data })),
  };
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(ctx as unknown as CanvasRenderingContext2D);
  vi.spyOn(window, 'getComputedStyle').mockReturnValue({
    getPropertyValue: (key: string) => (key === '--text-light' ? '#ffffff' : '#16161a'),
  } as CSSStyleDeclaration);
  const invalidate = vi.fn();
  const contrast = createTimelineOverlayContrast(invalidate);
  const canvas = document.createElement('canvas');
  const bounds = new DOMRect(100, 200, 640, 320);
  const prepare = () => contrast.prepare(canvas, bounds, 320, 160);
  const sample = () => {
    prepare();
    contrast.capture();
  };
  const badge = (x = 160) => {
    const element = document.createElement('span');
    element.getBoundingClientRect = () => new DOMRect(100 + x, 220, 16, 16);
    return element;
  };
  return {
    contrast,
    ctx,
    data,
    invalidate,
    canvas,
    bounds,
    prepare,
    sample,
    badge,
    advance: (value: number) => {
      time = value;
    },
  };
}
describe('shared timeline metadata contrast', () => {
  it.each([true, false])('pairs ink with the opposite opaque badge on a bright=%s thumbnail', (bright) => {
    const f = fixture(bright),
      element = f.badge();
    f.contrast.register(element);
    f.sample();
    expect(f.contrast.at(100, 20)).toEqual(
      bright ? { foreground: '#ffffff', background: '#16161a' } : { foreground: '#16161a', background: '#ffffff' },
    );
    expect(element.style.getPropertyValue('--timeline-overlay-ink')).toBe(bright ? '#ffffff' : '#16161a');
    expect(element.style.getPropertyValue('--timeline-overlay-background')).toBe(bright ? '#16161a' : '#ffffff');
    expect(f.ctx.getImageData).toHaveBeenCalledWith(0, 0, 64, 64);
    expect(f.ctx.setTransform).toHaveBeenLastCalledWith(0.2, 0, 0, 0.4, 0, 0);
    f.contrast.dispose();
  });
  it('chooses independent colors for adjacent badges and canvas labels on the same frame', () => {
    const f = fixture();
    for (let y = 0; y < 64; y++) for (let x = 32; x < 64; x++) f.data.set([0, 0, 0, 255], (y * 64 + x) * 4);
    const bright = f.badge(100),
      dark = f.badge(500);
    f.contrast.register(bright);
    f.contrast.register(dark);
    f.sample();
    expect(bright.style.getPropertyValue('--timeline-overlay-ink')).toBe('#ffffff');
    expect(dark.style.getPropertyValue('--timeline-overlay-ink')).toBe('#16161a');
    expect(f.contrast.at(520, 20)?.foreground).toBe('#16161a');
    f.contrast.dispose();
  });
  it('coalesces invalidations to eight small readbacks a second and releases a trailing frame', () => {
    vi.useFakeTimers();
    const f = fixture();
    f.sample();
    f.advance(10);
    expect(f.prepare()).toBeNull();
    f.contrast.capture();
    f.prepare();
    expect(vi.getTimerCount()).toBe(1);
    expect(f.ctx.getImageData).toHaveBeenCalledOnce();
    vi.advanceTimersByTime(115);
    expect(f.invalidate).toHaveBeenCalledOnce();
    f.advance(125);
    f.sample();
    expect(f.ctx.getImageData).toHaveBeenCalledTimes(2);
    f.advance(130);
    f.prepare();
    f.contrast.dispose();
    expect(vi.getTimerCount()).toBe(0);
    expect(f.contrast.at(10, 10)).toBeNull();
  });
  it('cancels an obsolete scheduled sample when a later paint already supplies fresh pixels', () => {
    vi.useFakeTimers();
    const f = fixture();
    f.sample();
    f.advance(10);
    f.prepare();
    expect(vi.getTimerCount()).toBe(1);
    f.advance(200);
    f.sample();
    expect(vi.getTimerCount()).toBe(0);
    f.contrast.dispose();
  });
  it('updates positions after scrolling and stops touching unmounted metadata', () => {
    const f = fixture(),
      element = f.badge();
    const release = f.contrast.register(element);
    f.sample();
    expect(f.invalidate).toHaveBeenCalledOnce();
    element.getBoundingClientRect = () => new DOMRect(1000, 200, 16, 16);
    f.advance(130);
    f.sample();
    expect(element.style.getPropertyValue('--timeline-overlay-ink')).toBe('');
    release();
    element.style.setProperty('--timeline-overlay-ink', 'kept');
    f.advance(260);
    f.sample();
    expect(element.style.getPropertyValue('--timeline-overlay-ink')).toBe('kept');
    f.contrast.dispose();
  });
  it('retains the theme badge defaults for transparent, missing or out-of-bounds pixels', () => {
    const f = fixture(),
      element = f.badge();
    f.contrast.register(element);
    expect(f.contrast.at(0, 0)).toBeNull();
    f.data.fill(0);
    f.sample();
    expect(f.contrast.at(50, 50)).toBeNull();
    expect(f.contrast.at(-1, 0)).toBeNull();
    expect(f.contrast.at(NaN, 0)).toBeNull();
    expect(element.style.length).toBe(0);
    f.contrast.dispose();
  });
  it.each(['width', 'height'] as const)('skips zero layout %s without reading pixels', (dimension) => {
    const f = fixture();
    expect(
      f.contrast.prepare(f.canvas, f.bounds, dimension === 'width' ? 0 : 320, dimension === 'height' ? 0 : 160),
    ).toBeNull();
    f.contrast.capture();
    expect(f.ctx.getImageData).not.toHaveBeenCalled();
    expect(f.contrast.prepare(f.canvas, new DOMRect(), 320, 160)).toBeNull();
    f.contrast.dispose();
  });
  it('keeps safe badges and does not repeatedly read a tainted probe', () => {
    const f = fixture();
    f.ctx.getImageData.mockImplementation(() => {
      throw new DOMException('Tainted', 'SecurityError');
    });
    f.sample();
    expect(f.contrast.at(0, 0)).toBeNull();
    f.advance(200);
    expect(f.prepare()).toBeNull();
    f.contrast.capture();
    expect(f.ctx.getImageData).toHaveBeenCalledOnce();
    f.contrast.dispose();
  });
  it('handles an unavailable probe context without scheduling work or fabricating a tone', () => {
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null);
    const contrast = createTimelineOverlayContrast(vi.fn());
    expect(contrast.prepare(document.createElement('canvas'), new DOMRect(0, 0, 100, 100), 100, 100)).toBeNull();
    contrast.capture();
    expect(contrast.at(0, 0)).toBeNull();
    contrast.dispose();
  });
  it('does not publish unresolved theme colors', () => {
    const f = fixture();
    vi.mocked(getComputedStyle).mockReturnValue({ getPropertyValue: () => '' } as unknown as CSSStyleDeclaration);
    f.sample();
    expect(f.contrast.at(10, 10)).toBeNull();
    f.contrast.dispose();
  });
});
describe('timeline contrast directive lifecycle', () => {
  it.each([true, false])('registers metadata with a present=%s owner and releases it on unmount', (provided) => {
    const register = vi.fn(() => vi.fn()),
      visible = ref(true);
    const Child = defineComponent({
      setup() {
        const directive = useTimelineOverlayContrast();
        return () => (visible.value ? withDirectives(h('span'), [[directive]]) : null);
      },
    });
    const wrapper = mount(
      defineComponent({
        setup() {
          if (provided)
            provide(TIMELINE_OVERLAY_CONTRAST_KEY, {
              register,
              prepare: vi.fn(),
              capture: vi.fn(),
              at: () => null,
              dispose: vi.fn(),
            });
          return () => h(Child);
        },
      }),
    );
    expect(register).toHaveBeenCalledTimes(provided ? 1 : 0);
    wrapper.unmount();
    if (provided) expect(register.mock.results[0]!.value).toHaveBeenCalledOnce();
  });
});
