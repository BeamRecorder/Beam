import { flushPromises, mount } from '@vue/test-utils';
import { MotionPlugin } from '@vueuse/motion';
import { afterEach, describe, expect, it, vi } from 'vitest';
import EditorProjectLoadingOverlay from '../EditorProjectLoadingOverlay.vue';

describe('EditorProjectLoadingOverlay', () => {
  afterEach(() => vi.useRealTimers());

  it('renders every editor surface as a stable animated-gradient skeleton', async () => {
    vi.useFakeTimers();
    const wrapper = mount(EditorProjectLoadingOverlay, {
      props: { visible: true, label: 'Preparing editor', showTopbarSkeleton: true },
      global: { plugins: [MotionPlugin] },
    });

    expect(wrapper.get('.editor-project-loading-overlay').attributes('aria-label')).toBe('Preparing editor');
    expect(wrapper.find('.loading-titlebar.shimmer-animated-gradient').exists()).toBe(true);

    const surfaces = [
      ['.loading-titlebar', 'height: 40px'],
      ['.loading-canvas-toolbar', 'height: 28px'],
      ['.loading-canvas-frame', 'height: 100%'],
      ['.loading-timeline-toolbar', 'height: 36px'],
      ['.loading-timeline', 'height: 100%'],
    ] as const;
    for (const [selector, dimension] of surfaces) {
      const surface = wrapper.get(selector);
      const skeleton = surface.classes().includes('shimmer-animated-gradient')
        ? surface
        : surface.get('.shimmer-animated-gradient');
      expect(skeleton.attributes('style')).toContain(dimension);
    }

    const upper = wrapper.get('.loading-upper').element;
    const resizeSpace = wrapper.get('.loading-timeline-resize-space').element;
    const timeline = wrapper.get('.loading-timeline').element;
    expect(upper.compareDocumentPosition(resizeSpace) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(resizeSpace.compareDocumentPosition(timeline) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(wrapper.get('.loading-sidebar-space').find('.shimmer-animated-gradient').exists()).toBe(false);
    expect(wrapper.get('.loading-properties-space').find('.shimmer-animated-gradient').exists()).toBe(false);

    await vi.advanceTimersByTimeAsync(210);
    await flushPromises();
    expect(wrapper.find('.editor-project-loading-overlay').exists()).toBe(true);

    await wrapper.setProps({ visible: false });
    expect(wrapper.find('.editor-project-loading-overlay').exists()).toBe(true);
    await vi.advanceTimersByTimeAsync(299);
    await flushPromises();
    expect(wrapper.find('.editor-project-loading-overlay').exists()).toBe(true);
    await vi.advanceTimersByTimeAsync(321);
    await flushPromises();
    expect(wrapper.find('.editor-project-loading-overlay').exists()).toBe(false);

    const switchWrapper = mount(EditorProjectLoadingOverlay, {
      props: { visible: true, label: 'Preparing editor', showTopbarSkeleton: false },
      global: { plugins: [MotionPlugin] },
    });
    expect(switchWrapper.find('.loading-titlebar.shimmer-animated-gradient').exists()).toBe(false);
    expect(switchWrapper.find('.loading-titlebar').exists()).toBe(true);
  });

  it('uses a custom timeline height while keeping inset sidebar and properties skeletons', () => {
    const wrapper = mount(EditorProjectLoadingOverlay, {
      props: { visible: true, label: 'Preparing editor', timelineHeight: 320 },
      global: { plugins: [MotionPlugin] },
    });

    const timeline = wrapper.get('.loading-timeline');
    expect(timeline.attributes('style')).toContain('height: 320px');
    expect(timeline.find('.shimmer-animated-gradient').attributes('style')).toContain('height: 100%');
    expect(timeline.find('.shimmer-animated-gradient').attributes('style')).toContain('border-radius: inherit');
    expect(wrapper.get('.loading-sidebar-space').find('.shimmer-animated-gradient').exists()).toBe(false);
    expect(wrapper.get('.loading-properties-space').find('.shimmer-animated-gradient').exists()).toBe(false);
  });
});
