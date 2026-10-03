import { flushPromises, mount } from '@vue/test-utils';
import { MotionPlugin } from '@vueuse/motion';
import { afterEach, describe, expect, it, vi } from 'vitest';
import CanvasLoadingSkeleton from '../CanvasLoadingSkeleton.vue';

describe('CanvasLoadingSkeleton', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('renders the animated gradient loading surface with its accessible label', () => {
    const wrapper = mount(CanvasLoadingSkeleton, {
      props: {
        visible: true,
        label: 'Loading canvas',
        aspectRatio: 16 / 9,
      },
      global: { plugins: [MotionPlugin] },
    });

    expect(wrapper.find('.canvas-loading-skeleton').exists()).toBe(true);
    expect(wrapper.find('.canvas-loading-skeleton .shimmer-animated-gradient').exists()).toBe(true);
    expect(wrapper.get('.canvas-loading-skeleton').attributes('aria-label')).toBe('Loading canvas');
    expect(
      wrapper.get<HTMLElement>('.canvas-loading-skeleton').element.style.getPropertyValue('--loading-aspect-ratio'),
    ).toBe(String(16 / 9));
  });

  it('removes the loading surface after the leave transition', async () => {
    vi.useFakeTimers();
    const wrapper = mount(CanvasLoadingSkeleton, {
      props: { visible: true, label: 'Loading canvas', aspectRatio: 16 / 9 },
      global: { plugins: [MotionPlugin] },
    });

    await wrapper.setProps({ visible: false });
    await flushPromises();
    expect(wrapper.emitted('reveal')).toHaveLength(1);

    await vi.advanceTimersByTimeAsync(650);
    await flushPromises();

    expect(wrapper.find('.canvas-loading-skeleton').exists()).toBe(false);
  });
});
