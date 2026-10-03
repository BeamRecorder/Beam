import { mount } from '@vue/test-utils';
import { describe, expect, it } from 'vitest';
import ProgressBar from './ProgressBar.vue';

describe('ProgressBar', () => {
  it.each([
    [50, 100, '50%'],
    [-2, 100, '0%'],
    [5, 0, '5%'],
    [200, 100, '100%'],
  ])('clamps %s/%s to %s', (value, max, expected) => {
    expect(mount(ProgressBar, { props: { value, max } }).get('.progress-bar-fill').attributes('style')).toContain(
      expected,
    );
  });
});
