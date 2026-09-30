import { mount } from '@vue/test-utils';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { nextTick } from 'vue';
import BeamMascot from './BeamMascot.vue';
import type { MascotPhase } from './mascot-types';

let callbacks: Map<number, FrameRequestCallback>;
let nextId: number;
let hidden: boolean;
let reduced: boolean;
let motionChanged: (event: MediaQueryListEvent) => void;
let removeMotion: ReturnType<typeof vi.fn>;
const wrappers: ReturnType<typeof mount>[] = [];
const setup = (phase: MascotPhase = 'recording', active = true) => {
  const wrapper = mount(BeamMascot, { props: { phase, active } });
  wrappers.push(wrapper);
  return wrapper;
};
const tick = (ms: number) => {
  const pending = [...callbacks.values()];
  callbacks.clear();
  pending.forEach((callback) => callback(ms));
};
beforeEach(() => {
  callbacks = new Map();
  nextId = 0;
  hidden = false;
  reduced = false;
  removeMotion = vi.fn();
  vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
    callbacks.set(++nextId, callback);
    return nextId;
  });
  vi.stubGlobal('cancelAnimationFrame', (id: number) => callbacks.delete(id));
  vi.stubGlobal('matchMedia', () => ({
    matches: reduced,
    addEventListener: (_: string, callback: typeof motionChanged) => {
      motionChanged = callback;
    },
    removeEventListener: removeMotion,
  }));
  vi.spyOn(document, 'hidden', 'get').mockImplementation(() => hidden);
});
afterEach(() => {
  wrappers.splice(0).forEach((wrapper) => wrapper.unmount());
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('BeamMascot lifecycle', () => {
  it('keeps the SVG decorative, bounded and separate from its red recording light', async () => {
    const wrapper = setup();
    expect(wrapper.attributes('aria-hidden')).toBe('true');
    expect(wrapper.get('svg').attributes('width')).toBe('48');
    expect(wrapper.find('.recording-light').exists()).toBe(true);
    await wrapper.setProps({ size: 32, phase: 'paused' });
    expect(wrapper.get('svg').attributes('height')).toBe('32');
    expect(wrapper.find('.recording-light').exists()).toBe(false);
    expect(callbacks.size).toBe(0);
  });
  it('owns one loop, limits SVG updates to 30 fps and bounds long frame stalls', async () => {
    const wrapper = setup('processing');
    expect(callbacks.size).toBe(1);
    tick(0);
    await nextTick();
    const original = wrapper.html();
    tick(10);
    await nextTick();
    expect(wrapper.html()).toBe(original);
    tick(40);
    await nextTick();
    expect(wrapper.html()).not.toBe(original);
    tick(10_000);
    await nextTick();
    expect(wrapper.html()).not.toContain('NaN');
    expect(callbacks.size).toBe(1);
  });
  it('stops in hidden documents and resumes without catching up through the hidden interval', async () => {
    const wrapper = setup();
    tick(0);
    tick(50);
    await nextTick();
    const frame = wrapper.html();
    hidden = true;
    document.dispatchEvent(new Event('visibilitychange'));
    expect(callbacks.size).toBe(0);
    hidden = false;
    document.dispatchEvent(new Event('visibilitychange'));
    tick(20_000);
    await nextTick();
    expect(wrapper.html()).toBe(frame);
    expect(callbacks.size).toBe(1);
  });
  it('starts without animation while hidden or inactive, then follows visibility changes', async () => {
    hidden = true;
    const wrapper = setup('processing', false);
    expect(callbacks.size).toBe(0);
    await wrapper.setProps({ active: true });
    expect(callbacks.size).toBe(0);
    hidden = false;
    document.dispatchEvent(new Event('visibilitychange'));
    expect(callbacks.size).toBe(1);
    await wrapper.setProps({ active: false });
    expect(callbacks.size).toBe(0);
  });
  it('settles a completed burst and does not replay it on equivalent props or visibility updates', async () => {
    const wrapper = setup('completed');
    for (let ms = 0; ms <= 2200; ms += 50) tick(ms);
    await nextTick();
    const settled = wrapper.html();
    expect(callbacks.size).toBe(0);
    await wrapper.setProps({ phase: 'completed' });
    document.dispatchEvent(new Event('visibilitychange'));
    expect(callbacks.size).toBe(0);
    expect(wrapper.html()).toBe(settled);
    await wrapper.setProps({ phase: 'processing' });
    expect(callbacks.size).toBe(1);
    await wrapper.setProps({ phase: 'completed' });
    expect(callbacks.size).toBe(1);
  });
  it('uses still poses initially and never replays confetti after changing reduced motion', async () => {
    reduced = true;
    const wrapper = setup('completed');
    expect(callbacks.size).toBe(0);
    motionChanged({ matches: false } as MediaQueryListEvent);
    expect(callbacks.size).toBe(0);
    await wrapper.setProps({ phase: 'processing' });
    expect(callbacks.size).toBe(1);
    motionChanged({ matches: true } as MediaQueryListEvent);
    expect(callbacks.size).toBe(0);
    motionChanged({ matches: false } as MediaQueryListEvent);
    expect(callbacks.size).toBe(1);
  });
  it('releases animation frames and media listeners on unmount', () => {
    const removeVisibility = vi.spyOn(document, 'removeEventListener');
    setup().unmount();
    expect(callbacks.size).toBe(0);
    expect(removeMotion).toHaveBeenCalledOnce();
    expect(removeVisibility).toHaveBeenCalledWith('visibilitychange', expect.any(Function));
  });
});
