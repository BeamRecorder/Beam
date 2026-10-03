import { mount } from '@vue/test-utils';
import { describe, expect, it } from 'vitest';
import TimelineClickEmptyState from '../TimelineClickEmptyState.vue';

describe('TimelineClickEmptyState.vue', () => {
  it('renders the mini timeline illustration, animated cursor, and localized title/desc', () => {
    const wrapper = mount(TimelineClickEmptyState);
    expect(wrapper.find('.mini-timeline').exists()).toBe(true);
    expect(wrapper.find('.animated-cursor').exists()).toBe(true);
    expect(wrapper.find('.target-clip').exists()).toBe(true);
    expect(wrapper.find('.empty-title').exists()).toBe(true);
  });
});
