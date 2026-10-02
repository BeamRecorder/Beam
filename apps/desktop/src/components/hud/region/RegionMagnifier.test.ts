import { mount } from '@vue/test-utils';
import { expect, it } from 'vitest';
import RegionMagnifier from './RegionMagnifier.vue';
it('samples the real desktop image centered on the pointer at 3× zoom', () => {
  const wrapper = mount(RegionMagnifier, {
    props: {
      image: 'data:image/png;base64,capture',
      pointer: { x: 100, y: 200 },
      viewport: { width: 1000, height: 800 },
    },
  });
  expect(wrapper.get('img').attributes('src')).toBe('data:image/png;base64,capture');
  expect(wrapper.get('img').attributes('style')).toContain('translate(-228px, -528px)');
  expect(wrapper.get('img').attributes('style')).toContain('width: 3000px');
  expect(wrapper.attributes('aria-hidden')).toBe('true');
  wrapper.unmount();
});
it('updates sampling and flips position at the screen edge', async () => {
  const wrapper = mount(RegionMagnifier, {
    props: {
      image: 'capture',
      pointer: { x: 100, y: 200 },
      viewport: { width: 1000, height: 800 },
    },
  });
  await wrapper.setProps({ pointer: { x: 995, y: 795 } });
  expect(wrapper.attributes('style')).toContain('left: 827px');
  expect(wrapper.get('img').attributes('style')).toContain('translate(-2913px, -2313px)');
  wrapper.unmount();
});
it('follows the resized upper left corner and viewport size', async () => {
  const wrapper = mount(RegionMagnifier, {
    props: {
      image: 'capture',
      pointer: { x: 400, y: 400, handle: 'nw' },
      viewport: { width: 1000, height: 800 },
    },
  });
  expect(wrapper.attributes('style')).toContain('top: 232px');
  await wrapper.setProps({ viewport: { width: 500, height: 500 } });
  expect(wrapper.get('img').attributes('style')).toContain('height: 1500px');
  wrapper.unmount();
});
