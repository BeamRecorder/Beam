import { defineComponent, h, vShow, withDirectives } from 'vue';
import { enableAutoUnmount, mount } from '@vue/test-utils';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import RafRevealTransition from './RafRevealTransition.vue';

enableAutoUnmount(afterEach);
let time = 0;
let reduced = false;
let nextId = 0;
const frames = new Map<number, FrameRequestCallback>();
const step = (elapsed: number) => {
  time += elapsed;
  const pending = [...frames.values()];
  frames.clear();
  pending.forEach((frame) => frame(time));
};
beforeEach(() => {
  time = nextId = 0;
  reduced = false;
  frames.clear();
  vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
    const id = nextId++;
    frames.set(id, callback);
    return id;
  });
  vi.stubGlobal('cancelAnimationFrame', (id: number) => frames.delete(id));
  vi.spyOn(performance, 'now').mockImplementation(() => time);
  vi.spyOn(window, 'matchMedia').mockImplementation(
    () =>
      ({
        get matches() {
          return reduced;
        },
      }) as MediaQueryList,
  );
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (this: HTMLElement) {
    return {
      height: Number.parseFloat(this.style.height) || 100,
      width: Number.parseFloat(this.style.width) || 300,
    } as DOMRect;
  });
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});
const create = () =>
  mount(
    defineComponent({
      data: () => ({ open: false }),
      render() {
        return h(RafRevealTransition, {}, () => (this.open ? h('div', { class: 'panel' }, 'Advanced controls') : null));
      },
    }),
    { global: { stubs: { transition: false } } },
  );

it('runs the Vue enter and leave hooks without scaling content or leaving styles behind', async () => {
  const wrapper = create();
  await wrapper.setData({ open: true });
  const panel = wrapper.get('.panel').element as HTMLElement;
  expect(panel.style.height).toBe('0px');
  step(100);
  expect(panel.style.height).toBe('50px');
  expect(panel.style.transform).toBe('');
  step(100);
  expect(panel.style.height).toBe('');
  await wrapper.setData({ open: false });
  expect(panel.parentNode).not.toBeNull();
  step(200);
  expect(wrapper.find('.panel').exists()).toBe(false);
  expect(frames.size).toBe(0);
});
it('cancels interrupted transitions and releases active frames when unmounted', async () => {
  const wrapper = create();
  await wrapper.setData({ open: true });
  step(50);
  await wrapper.setData({ open: false });
  const closing = wrapper.element.querySelector?.('.panel') as HTMLElement | null;
  const height = closing?.style.height;
  await wrapper.setData({ open: true });
  expect(frames.size).toBe(1);
  if (height) expect((wrapper.get('.panel').element as HTMLElement).style.height).toBe(height);
  step(200);
  expect(wrapper.find('.panel').exists()).toBe(true);
  await wrapper.setData({ open: false });
  wrapper.unmount();
  expect(frames.size).toBe(0);
});
it('honors reduced motion on opening and closing', async () => {
  reduced = true;
  const wrapper = create();
  await wrapper.setData({ open: true });
  expect(wrapper.get('.panel').attributes('style') || '').not.toContain('height');
  await wrapper.setData({ open: false });
  expect(wrapper.find('.panel').exists()).toBe(false);
  expect(frames.size).toBe(0);
});

it('animates a mounted horizontal inspector and reverses closing without remounting its controls', async () => {
  const wrapper = mount(
    defineComponent({
      data: () => ({ open: true }),
      render() {
        return h(RafRevealTransition, { axis: 'horizontal' }, () =>
          withDirectives(h('aside', { class: 'panel' }, [h('input')]), [[vShow, this.open]]),
        );
      },
    }),
    { global: { stubs: { transition: false } } },
  );
  const panel = wrapper.get('.panel').element as HTMLElement;
  const input = wrapper.get('input').element as HTMLInputElement;
  input.value = 'Retained draft';
  await wrapper.setData({ open: false });
  step(100);
  expect(panel.style.width).toBe('150px');
  expect(panel.style.height).toBe('');
  await wrapper.setData({ open: true });
  expect(panel.style.width).toBe('150px');
  expect(frames.size).toBe(1);
  step(200);
  expect(wrapper.get('input').element).toBe(input);
  expect(input.value).toBe('Retained draft');
  expect(panel.style.width).toBe('');
  await wrapper.setData({ open: false });
  step(200);
  expect(panel.style.display).toBe('none');
  expect(frames.size).toBe(0);
  await wrapper.setData({ open: true });
  expect(panel.style.width).toBe('0px');
  step(200);
  expect(panel.style.display).not.toBe('none');
});
