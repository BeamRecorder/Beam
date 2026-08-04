import { mount } from '@vue/test-utils';
import { describe, expect, it } from 'vitest';
import ZoomClickEmptyState from '../ZoomClickEmptyState.vue';

describe('ZoomClickEmptyState.vue', () => {
  it('renders mini zoom timeline illustration, cursor, and zoom region target', () => {
    const wrapper = mount(ZoomClickEmptyState);
    expect(wrapper.find('.mini-timeline').exists()).toBe(true);
    expect(wrapper.find('.animated-cursor').exists()).toBe(true);
    expect(wrapper.find('.target-zoom').exists()).toBe(true);
    expect(wrapper.find('.empty-title').exists()).toBe(true);
  });
});
