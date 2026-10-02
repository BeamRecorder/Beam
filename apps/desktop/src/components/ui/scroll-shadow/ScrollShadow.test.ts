import { describe, it, expect } from 'vitest';
import { mount } from '@vue/test-utils';
import { nextTick, type VNode, type CSSProperties } from 'vue';
import ScrollShadow from './ScrollShadow.vue';

describe('ScrollShadow.vue', () => {
  it.each(['vertical', 'horizontal', 'both'] as const)('selects the scrollable axes for %s', (orientation) => {
    const wrapper = mount(ScrollShadow, { props: { orientation } });
    expect(wrapper.get('.scroll-shadow-viewport').classes().includes('is-horizontal')).toBe(
      orientation === 'horizontal',
    );
    expect(wrapper.get('.scroll-shadow-viewport').classes().includes('is-both')).toBe(orientation === 'both');
    wrapper.unmount();
  });
  it('forwards the viewport scroll event to virtualized consumers', async () => {
    const wrapper = mount(ScrollShadow);
    await wrapper.get('.scroll-shadow-viewport').trigger('scroll');
    expect(wrapper.emitted('scroll')).toHaveLength(1);
    expect(wrapper.emitted('scroll')?.[0]?.[0]).toBeInstanceOf(Event);
    wrapper.unmount();
  });

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

  it('uses the same fade size at the top and bottom edges', async () => {
    const wrapper = mount(ScrollShadow, { props: { size: 24 } });
    const viewport = wrapper.get('.scroll-shadow-viewport').element;
    Object.defineProperties(viewport, {
      clientHeight: { value: 100, configurable: true },
      scrollHeight: { value: 300, configurable: true },
      scrollTop: { value: 0, writable: true, configurable: true },
    });
    const updateShadows = (wrapper.vm as unknown as { updateShadows: () => void }).updateShadows;

    updateShadows();
    await nextTick();
    expect(wrapper.vm.hasBottomShadow).toBe(true);
    const viewportStyle = () => (wrapper.vm.$.subTree.children as VNode[])[0]!.props!.style as CSSProperties;
    // jsdom's CSS parser rejects this valid mask; assert the style passed to Vue.
    expect(viewportStyle().maskImage).toContain('calc(100% - 24px)');

    Object.defineProperty(viewport, 'scrollTop', {
      value: 200,
      writable: true,
      configurable: true,
    });
    updateShadows();
    await nextTick();
    expect(wrapper.vm.hasTopShadow).toBe(true);
    expect(viewportStyle().maskImage).toContain('black 24px');
  });
});
