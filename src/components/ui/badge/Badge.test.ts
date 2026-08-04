import { mount } from '@vue/test-utils';
import { describe, expect, it } from 'vitest';
import Badge from './Badge.vue';

describe('Badge', () => {
  it.each(['primary', 'secondary', 'success', 'error', 'info', 'outline'] as const)(
    'renders the %s variant',
    (variant) => {
      const wrapper = mount(Badge, { props: { variant }, slots: { default: 'State' } });
      expect(wrapper.classes()).toContain(`badge-${variant}`);
      expect(wrapper.text()).toBe('State');
    },
  );
});
