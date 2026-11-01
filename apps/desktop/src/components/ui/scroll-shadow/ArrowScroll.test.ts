import { beforeEach, afterEach, expect, it, vi } from 'vitest';
import { enableAutoUnmount, mount } from '@vue/test-utils';
import { nextTick } from 'vue';
import type { Ref } from 'vue';
import type * as VueUse from '@vueuse/core';
import ArrowScroll from './ArrowScroll.vue';
import ScrollShadow from './ScrollShadow.vue';

const media = vi.hoisted(() => ({ reduced: null as Ref<string> | null }));
vi.mock('@vueuse/core', async (importOriginal) => {
  const actual = await importOriginal<typeof VueUse>(),
    { ref } = await import('vue');
  media.reduced = ref('no-preference');
  return { ...actual, usePreferredReducedMotion: () => media.reduced };
});
enableAutoUnmount(afterEach);
beforeEach(() => {
  vi.useFakeTimers();
  media.reduced!.value = 'no-preference';
});
afterEach(() => {
  vi.useRealTimers();
});
const create = async (overflow = true) => {
  const wrapper = mount(ArrowScroll, {
    props: { leftLabel: 'Left', rightLabel: 'Right' },
    slots: { default: '<button>Tool</button>' },
  });
  const shadow = wrapper.findComponent(ScrollShadow),
    element = shadow.vm.viewportRef!;
  Object.defineProperties(element, {
    scrollWidth: { configurable: true, value: overflow ? 600 : 200 },
    clientWidth: { configurable: true, value: 200 },
  });
  shadow.vm.updateShadows();
  await nextTick();
  return { wrapper, element };
};
it('keeps a fitting row idle without arrows and only scrolls when it overflows', async () => {
  const { wrapper, element } = await create(false);
  expect(wrapper.find('button[aria-label="Right"]').exists()).toBe(false);
  expect(wrapper.find('button[aria-label="Left"]').exists()).toBe(false);
  vi.advanceTimersByTime(1000);
  expect(element.scrollLeft).toBe(0);
});
it('scrolls on hover and stops on pointer exit and window blur', async () => {
  const { wrapper, element } = await create();
  await wrapper.get('button[aria-label="Right"]').trigger('mouseenter');
  vi.advanceTimersByTime(64);
  await nextTick();
  expect(element.scrollLeft).toBeGreaterThan(0);
  await wrapper.get('button[aria-label="Right"]').trigger('mouseleave');
  const stopped = element.scrollLeft;
  vi.advanceTimersByTime(64);
  expect(element.scrollLeft).toBe(stopped);
  await wrapper.get('button[aria-label="Left"]').trigger('mouseenter');
  vi.advanceTimersByTime(16);
  window.dispatchEvent(new Event('blur'));
  const blurred = element.scrollLeft;
  vi.advanceTimersByTime(64);
  expect(element.scrollLeft).toBe(blurred);
});
it('bounds click navigation and reveal, and stops a running hover when disabled', async () => {
  const { wrapper, element } = await create();
  await wrapper.get('button[aria-label="Right"]').trigger('click');
  expect(element.scrollLeft).toBe(140);
  wrapper.vm.revealEnd();
  await nextTick();
  expect(element.scrollLeft).toBe(400);
  expect(wrapper.find('button[aria-label="Right"]').exists()).toBe(false);
  await wrapper.get('button[aria-label="Left"]').trigger('mouseenter');
  await wrapper.setProps({ disabled: true });
  vi.advanceTimersByTime(64);
  expect(element.scrollLeft).toBe(400);
  wrapper.vm.revealEnd();
  expect(element.scrollLeft).toBe(400);
  await wrapper.get('button[aria-label="Left"]').trigger('mouseenter');
  vi.advanceTimersByTime(32);
  expect(element.scrollLeft).toBe(400);
  await wrapper.setProps({ disabled: false });
  await wrapper.get('button[aria-label="Left"]').trigger('mouseenter');
  vi.advanceTimersByTime(32);
  expect(element.scrollLeft).toBeLessThan(400);
});
it('respects reduced motion while keeping click navigation available', async () => {
  const { wrapper, element } = await create();
  media.reduced!.value = 'reduce';
  await nextTick();
  await wrapper.get('button[aria-label="Right"]').trigger('mouseenter');
  vi.advanceTimersByTime(64);
  expect(element.scrollLeft).toBe(0);
  await wrapper.get('button[aria-label="Right"]').trigger('click');
  expect(element.scrollLeft).toBe(140);
  media.reduced!.value = 'no-preference';
  await nextTick();
  await wrapper.get('button[aria-label="Right"]').trigger('mouseenter');
  vi.advanceTimersByTime(32);
  expect(element.scrollLeft).toBeGreaterThan(140);
});
it('scrolls left on click, stops automatically at the edge and pauses when the document is hidden', async () => {
  const { wrapper, element } = await create();
  wrapper.vm.revealEnd();
  await nextTick();
  await wrapper.get('button[aria-label="Left"]').trigger('click');
  expect(element.scrollLeft).toBe(260);
  await wrapper.get('button[aria-label="Right"]').trigger('mouseenter');
  vi.advanceTimersByTime(1000);
  await nextTick();
  expect(element.scrollLeft).toBe(400);
  await wrapper.get('button[aria-label="Left"]').trigger('mouseenter');
  vi.advanceTimersByTime(32);
  const hidden = vi.spyOn(document, 'hidden', 'get').mockReturnValue(true);
  document.dispatchEvent(new Event('visibilitychange'));
  const stopped = element.scrollLeft;
  vi.advanceTimersByTime(100);
  expect(element.scrollLeft).toBe(stopped);
  hidden.mockReturnValue(false);
  document.dispatchEvent(new Event('visibilitychange'));
  expect(element.scrollLeft).toBe(stopped);
  hidden.mockRestore();
});
