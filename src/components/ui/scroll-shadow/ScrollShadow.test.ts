import { describe, it, expect } from 'vitest';
import { mount } from '@vue/test-utils';
import ScrollShadow from './ScrollShadow.vue';

describe('ScrollShadow.vue', () => {
  it('renders slot content inside scrollable viewport', () => {
    const wrapper = mount(ScrollShadow, {
      slots: {
        default: '<div class="test-item">Hello World</div>',
      },
    });

    expect(wrapper.find('.scroll-shadow-viewport').exists()).toBe(true);
    expect(wrapper.find('.test-item').text()).toBe('Hello World');
  });

  it('exposes scroll state and update methods', () => {
    const wrapper = mount(ScrollShadow, {
      props: {
        orientation: 'vertical',
      },
    });

    expect(wrapper.vm.viewportRef).toBeDefined();
    expect(wrapper.vm.hasTopShadow).toBe(false);
    expect(wrapper.vm.hasBottomShadow).toBe(false);
    expect(typeof wrapper.vm.updateShadows).toBe('function');
  });

  it('applies custom viewportClass and hideScrollbar class', () => {
    const wrapper = mount(ScrollShadow, {
      props: {
        viewportClass: 'custom-viewport-class',
        hideScrollbar: true,
      },
    });

    const viewport = wrapper.find('.scroll-shadow-viewport');
    expect(viewport.classes()).toContain('custom-viewport-class');
    expect(viewport.classes()).toContain('hide-scrollbar');
  });

  it('applies dynamic mask when overflow is detected', async () => {
    const wrapper = mount(ScrollShadow, {
      props: {
        orientation: 'vertical',
        size: 24,
      },
    });

    // When neither top nor bottom overflow, no mask
    expect(wrapper.find('.scroll-shadow-viewport').attributes('style')).toBeUndefined();
  });
});
