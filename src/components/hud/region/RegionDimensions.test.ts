import { mount } from '@vue/test-utils';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { nextTick } from 'vue';
import RegionDimensions from './RegionDimensions.vue';

let frames: Map<number, FrameRequestCallback>;
let nextId: number;
beforeEach(() => {
  frames = new Map();
  nextId = 0;
  vi.stubGlobal(
    'requestAnimationFrame',
    vi.fn((callback: FrameRequestCallback) => {
      frames.set(++nextId, callback);
      return nextId;
    }),
  );
  vi.stubGlobal(
    'cancelAnimationFrame',
    vi.fn((id: number) => frames.delete(id)),
  );
});
afterEach(() => vi.unstubAllGlobals());
async function tick(time: number) {
  const callbacks = [...frames.values()];
  frames.clear();
  callbacks.forEach((callback) => callback(time));
  await nextTick();
}
it('announces pixel dimensions and rolls digits on animation frames until settled', async () => {
  const wrapper = mount(RegionDimensions, { props: { width: 99, height: 0 } });
  expect(wrapper.attributes('aria-label')).toBe('99 × 0');
  await wrapper.setProps({ width: 101, height: 200 });
  // The leading digits already show the new value before the first RAF.
  expect(wrapper.findAll('.reel')[0]!.attributes('style')).toContain('translateY(-2.2em)');
  await tick(0);
  await tick(16);
  expect(wrapper.attributes('aria-label')).toBe('101 × 200');
  expect(frames.size).toBe(1);
  for (let time = 32; time < 160; time += 16) await tick(time);
  expect(frames.size).toBe(0);
  expect(wrapper.findAll('.reel').map((digit) => digit.attributes('style'))).toEqual([
    'transform: translateY(-2.5em);',
    'transform: translateY(-1.25em);',
    'transform: translateY(-2.5em);',
    'transform: translateY(-3.75em);',
    'transform: translateY(-1.25em);',
    'transform: translateY(-1.25em);',
  ]);
  wrapper.unmount();
});
it('retargets from the displayed value and cancels remaining frames on unmount', async () => {
  const wrapper = mount(RegionDimensions, { props: { width: 400, height: 300 } });
  await wrapper.setProps({ width: 600 });
  await tick(10);
  await tick(30);
  await wrapper.setProps({ width: 250 });
  expect(cancelAnimationFrame).not.toHaveBeenCalled();
  expect(frames.size).toBe(1);
  wrapper.unmount();
  expect(frames.size).toBe(0);
});
it('settles immediately when reduced motion is requested, including an active animation', async () => {
  const wrapper = mount(RegionDimensions, { props: { width: 400, height: 300 } });
  await wrapper.setProps({ width: 600 });
  vi.spyOn(window, 'matchMedia').mockReturnValue({ matches: true } as MediaQueryList);
  await wrapper.setProps({ width: 8, height: 5 });
  expect(frames.size).toBe(0);
  expect(wrapper.findAll('.reel').map((digit) => digit.attributes('style'))).toEqual([
    'transform: translateY(-11.25em);',
    'transform: translateY(-7.5em);',
  ]);
  wrapper.unmount();
  vi.restoreAllMocks();
});
it('keeps all digit baselines aligned and exact through consecutive live drag updates', async () => {
  const wrapper = mount(RegionDimensions, { props: { width: 400, height: 300, live: true } });
  for (const width of [421, 568, 1000, 10]) {
    await wrapper.setProps({ width });
    expect(wrapper.attributes('aria-label')).toBe(`${width} × 300`);
    const expected = `${width}300`.split('').map((digit) => `transform: translateY(${-(Number(digit) + 1) * 1.25}em);`);
    expect(wrapper.findAll('.reel').map((digit) => digit.attributes('style'))).toEqual(expected);
  }
  expect(frames.size).toBe(0);
  await wrapper.setProps({ live: false });
  expect(frames.size).toBe(0);
  wrapper.unmount();
});
