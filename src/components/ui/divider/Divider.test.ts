import { mount } from '@vue/test-utils';
import { describe, expect, it } from 'vitest';
import Divider from './Divider.vue';

describe('Divider', () => {
  it('defaults to an accessible horizontal separator', () => {
    const wrapper = mount(Divider);
    expect(wrapper.attributes('role')).toBe('separator');
    expect(wrapper.attributes('aria-orientation')).toBe('horizontal');
  });
  it('renders vertical labels when requested', () => {
    const wrapper = mount(Divider, { props: { orientation: 'vertical', label: 'or' } });
    expect(wrapper.classes()).toContain('divider-vertical');
    expect(wrapper.text()).toBe('or');
  });
  it('renders horizontal divider with label and flanking lines', () => {
    const wrapper = mount(Divider, { props: { label: 'Category' } });
    expect(wrapper.classes()).toContain('has-label');
    expect(wrapper.findAll('.divider-line')).toHaveLength(2);
    expect(wrapper.find('.divider-label').text()).toBe('Category');
  });
});
