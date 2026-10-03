import { enableAutoUnmount, flushPromises, mount } from '@vue/test-utils';
import { afterEach, expect, it, vi } from 'vitest';
import { nextTick } from 'vue';
import ScreenshotCompositionLabel from './ScreenshotCompositionLabel.vue';
import ScrollShadow from '~/ui/scroll-shadow/ScrollShadow.vue';
const resize = vi.hoisted(() => ({ measure: undefined as (() => void) | undefined }));
vi.mock('@vueuse/core', async (original) => ({
  ...(await original<typeof import('@vueuse/core')>()),
  useResizeObserver: (_target: unknown, callback: () => void) => {
    resize.measure = callback;
  },
}));
enableAutoUnmount(afterEach);
const setup = (width: number, textWidth: number) => {
  const wrapper = mount(ScreenshotCompositionLabel, { props: { text: 'Beam logo and editable text' } });
  const viewport = wrapper.get('.scroll-shadow-viewport').element;
  const label = wrapper.get('.label-text').element;
  Object.defineProperties(viewport, {
    clientWidth: { value: width, configurable: true },
    scrollWidth: { value: textWidth, configurable: true },
  });
  Object.defineProperty(label, 'scrollWidth', { value: textWidth, configurable: true });
  return { wrapper, viewport, label };
};
it('keeps fitting labels still and disables horizontal scrolling without losing their text', async () => {
  const { wrapper } = setup(180, 160);
  resize.measure!();
  await nextTick();
  expect(wrapper.classes()).not.toContain('overflowing');
  expect(wrapper.get('.scroll-shadow-viewport').classes()).toContain('clip-overflow');
  expect(wrapper.text()).toBe('Beam logo and editable text');
});
it('fades overflowing labels and measures a bounded-speed marquee distance', async () => {
  const { wrapper } = setup(100, 340);
  resize.measure!();
  await nextTick();
  expect(wrapper.classes()).toContain('overflowing');
  expect(wrapper.attributes('style')).toContain('--label-travel: 240px');
  expect(wrapper.attributes('style')).toContain('--label-duration: 8s');
  expect(wrapper.getComponent(ScrollShadow).vm.hasRightShadow).toBe(true);
});
it('remeasures renames and wider panels without leaving a stale marquee or shadow', async () => {
  const { wrapper, label, viewport } = setup(100, 180);
  resize.measure!();
  await nextTick();
  expect(wrapper.classes()).toContain('overflowing');
  Object.defineProperty(label, 'scrollWidth', { value: 50 });
  Object.defineProperty(viewport, 'scrollWidth', { value: 50 });
  await wrapper.setProps({ text: 'Beam' });
  await flushPromises();
  expect(wrapper.classes()).not.toContain('overflowing');
  expect(wrapper.attributes('style')).toContain('--label-travel: 0px');
  expect(wrapper.text()).toBe('Beam');
});
it('ignores a stale observer callback after the label has unmounted', () => {
  const { wrapper } = setup(100, 200);
  wrapper.unmount();
  expect(() => resize.measure!()).not.toThrow();
});
