import { mount } from '@vue/test-utils';
import { expect, it, vi } from 'vitest';
import Heading from '../ScreenshotCompositionHeading.vue';
vi.mock('~/i18n/useTranslate', () => ({ useTranslate: () => ({ t: () => 'Composition' }) }));

it.each([0, 1, 32768])('retains the heading and a count of %s in the compact dock preview', (count) => {
  const wrapper = mount(Heading, { props: { count, collapsed: true, compact: true } });
  expect(wrapper.get('strong').text()).toBe('Composition');
  expect(wrapper.get('.layer-count').text()).toBe(String(count));
  expect(wrapper.classes()).toContain('compact');
});

it.each([
  [true, false, false],
  [false, false, true],
  [true, true, true],
  [false, true, false],
])('points toward the content when collapsed=%s and upward=%s', (collapsed, upward, pointsUp) => {
  const wrapper = mount(Heading, { props: { count: 3, collapsed, upward } });
  expect(wrapper.get('.composition-chevron').classes().includes('points-up')).toBe(pointsUp);
});
