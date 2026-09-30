import { mount } from '@vue/test-utils';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { nextTick } from 'vue';
import BrandLogo from './BrandLogo.vue';
import { BRAND_JINGLE_SECONDS } from './brand-motion';

let frames: Map<number, FrameRequestCallback>;
let frameId = 0;
let hidden = false;
let reduced = false;
let listeners: Set<(event: MediaQueryListEvent) => void>;
const wrappers: ReturnType<typeof mount>[] = [];
const setup = (title?: string) => {
  const wrapper = mount(BrandLogo, { props: { title } });
  wrappers.push(wrapper);
  return wrapper;
};
const tick = async (time: number) => {
  const pending = [...frames.values()];
  frames.clear();
  pending.forEach((callback) => callback(time));
  await nextTick();
};
beforeEach(() => {
  frames = new Map();
  listeners = new Set();
  frameId = 0;
  hidden = false;
  reduced = false;
  vi.spyOn(Math, 'random').mockReturnValue(0.35);
  vi.spyOn(document, 'hidden', 'get').mockImplementation(() => hidden);
  vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
    frames.set(++frameId, callback);
    return frameId;
  });
  vi.stubGlobal('cancelAnimationFrame', (id: number) => frames.delete(id));
  vi.stubGlobal('matchMedia', () => ({
    matches: reduced,
    addEventListener: (_: string, callback: (event: MediaQueryListEvent) => void) => listeners.add(callback),
    removeEventListener: (_: string, callback: (event: MediaQueryListEvent) => void) => listeners.delete(callback),
  }));
});
afterEach(() => {
  wrappers.splice(0).forEach((wrapper) => wrapper.unmount());
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('interactive Beam identity', () => {
  it('retains a failure expression during wordmark interactions and recovers when the error clears', async () => {
    const wrapper = setup();
    await wrapper.setProps({ phase: 'failed' });
    await wrapper.get('button').trigger('click');
    expect(wrapper.get('.beam-mascot').attributes('data-phase')).toBe('failed');
    await wrapper.setProps({ phase: 'idle' });
    expect(wrapper.get('.beam-mascot').attributes('data-phase')).toBe('processing');
  });
  it('uses a themed Beamy portrait in an accessible native button with a stable docking slot', () => {
    const wrapper = setup();
    expect(wrapper.get('button').attributes('type')).toBe('button');
    expect(wrapper.get('button').attributes('aria-label')).toBe('Animate Beamy');
    expect(wrapper.get('[data-beamy-dock] svg').attributes('viewBox')).toBe('-116 -116 232 232');
    expect(wrapper.get('.topbar-title').text()).toBe('Beam');
    expect(wrapper.find('.brand-effects').exists()).toBe(false);
    expect(wrapper.get('.brand-wordmark').attributes('style')).toContain('visibility: visible');
    expect(wrapper.find('img').exists()).toBe(false);
    expect(frames.size).toBe(0);
  });
  it('dances and animates letters on click, settles, then plays a different jingle', async () => {
    const wrapper = setup();
    await wrapper.get('button').trigger('click');
    expect(wrapper.get('.beam-mascot').attributes('data-phase')).toBe('processing');
    await tick(0);
    await tick(100);
    const first = wrapper.findAll('.brand-letter-effect').map((letter) => letter.attributes('style'));
    expect(first.join('')).not.toContain('NaN');
    const end = BRAND_JINGLE_SECONDS * 1000;
    for (let time = 200; time <= end + 100; time += 100) await tick(time);
    expect(wrapper.get('.beam-mascot').attributes('data-phase')).toBe('idle');
    expect(wrapper.get('.topbar-title').text()).toBe('Beam');
    expect(wrapper.find('.brand-effects').exists()).toBe(false);
    for (let time = end + 200; time <= end + 900; time += 100) await tick(time);
    expect(frames.size).toBe(0);
    wrapper.get('button').element.dispatchEvent(new MouseEvent('click', { detail: 0, bubbles: true }));
    await nextTick();
    await tick(end + 1000);
    await tick(end + 1100);
    expect(wrapper.findAll('.brand-letter-effect').map((letter) => letter.attributes('style'))).not.toEqual(first);
  });
  it('bounds repeated clicks and releases both animation loops and listeners on unmount', async () => {
    const wrapper = setup();
    await wrapper.get('button').trigger('click');
    const count = frames.size;
    for (let index = 0; index < 10; index++) await wrapper.get('button').trigger('click');
    expect(frames.size).toBe(count);
    expect(count).toBe(2);
    wrapper.unmount();
    expect(frames.size).toBe(0);
    expect(listeners.size).toBe(0);
  });
  it('keeps reduced-motion and hidden clicks still, and stops active motion when hidden', async () => {
    reduced = true;
    const wrapper = setup('Preparing');
    await wrapper.get('button').trigger('click');
    expect(frames.size).toBe(0);
    expect(wrapper.get('.topbar-title').text()).toBe('Preparing');
    listeners.forEach((listener) => listener({ matches: false } as MediaQueryListEvent));
    hidden = true;
    await wrapper.get('button').trigger('click');
    expect(frames.size).toBe(0);
    hidden = false;
    await wrapper.get('button').trigger('click');
    await tick(0);
    await tick(10000);
    expect(frames.size).toBe(2);
    hidden = true;
    document.dispatchEvent(new Event('visibilitychange'));
    await nextTick();
    expect(frames.size).toBe(0);
  });
  it('settles immediately when reduced motion is enabled mid-jingle', async () => {
    const wrapper = setup();
    await wrapper.get('button').trigger('click');
    listeners.forEach((listener) => listener({ matches: true } as MediaQueryListEvent));
    await nextTick();
    expect(frames.size).toBe(0);
    expect(wrapper.get('.beam-mascot').attributes('data-phase')).toBe('idle');
  });
});
