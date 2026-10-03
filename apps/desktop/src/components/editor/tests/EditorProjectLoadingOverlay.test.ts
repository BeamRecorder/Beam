import { enableAutoUnmount, flushPromises, mount } from '@vue/test-utils';
import { afterEach, describe, expect, it, vi } from 'vitest';
import EditorProjectLoadingOverlay from '../EditorProjectLoadingOverlay.vue';
import EditorLoadingLayout from '../layout/EditorLoadingLayout.vue';
import EditorLoadingFrame from '../layout/EditorLoadingFrame.vue';
import ScreenshotToolbar from '../../screenshot/ScreenshotToolbar.vue';
import CanvasToolbar from '../canvas/CanvasToolbar.vue';
import TimelineToolbar from '../timeline/TimelineToolbar.vue';
vi.mock('~/api/capture', () => ({ capture: {} }));
enableAutoUnmount(afterEach);
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});
const create = (props = {}) =>
  mount(EditorProjectLoadingOverlay, {
    props: { visible: true, label: 'Preparing editor', showTopbarSkeleton: true, ...props },
    global: {
      stubs: { ScreenshotCompositionSkeleton: true, EditorSkeletonSurface: { template: '<div><slot /></div>' } },
    },
  });

describe('shared editor loading layout', () => {
  it('starts opaque immediately with the real titlebar and workspace, without a bright enter flash', () => {
    const wrapper = create();
    expect(wrapper.get('[role="status"]').attributes('aria-label')).toBe('Preparing editor');
    expect(wrapper.get('.loading-titlebar').classes()).toContain('editor-titlebar');
    expect(wrapper.get('.loading-workspace').attributes('data-editor-kind')).toBe('video');
    expect(wrapper.get('.loading-workspace').attributes('inert')).toBeDefined();
    expect(wrapper.get('[role="status"]').classes()).not.toContain('is-leaving');
  });
  it('uses the video surfaces and saved timeline height, without screenshot controls', () => {
    const wrapper = create({ timelineHeight: 320 });
    expect(wrapper.get('.loading-timeline').attributes('style')).toContain('height: 320px');
    expect(wrapper.find('.loading-sidebar').exists()).toBe(true);
    expect(wrapper.find('.loading-canvas-toolbar').exists()).toBe(true);
    expect(wrapper.find('.loading-playback-toolbar').exists()).toBe(true);
    expect(wrapper.findComponent(CanvasToolbar).props('loading')).toBe(false);
    expect(wrapper.findComponent(TimelineToolbar).props('loading')).toBe(false);
    expect(wrapper.get('.loading-canvas-toolbar').find('button').exists()).toBe(true);
    expect(wrapper.get('.loading-playback-toolbar').find('button').exists()).toBe(true);
    expect(wrapper.find('.screenshot-toolbar').exists()).toBe(false);
    expect(wrapper.get('.loading-properties').classes()).toContain('video');
  });
  it('uses screenshot inspector, exact intrinsic dock and Composition without a video sidebar or timeline', () => {
    const wrapper = create({ kind: 'screenshot', aspectRatio: 3 / 2 });
    expect(wrapper.get('.loading-properties').classes()).toContain('screenshot');
    expect(wrapper.find('.screenshot-toolbar').exists()).toBe(true);
    expect(wrapper.find('screenshot-composition-skeleton-stub').exists()).toBe(true);
    expect(wrapper.find('.loading-sidebar').exists()).toBe(false);
    expect(wrapper.find('.loading-timeline').exists()).toBe(false);
    expect(wrapper.find('.loading-playback-toolbar').exists()).toBe(false);
    expect(wrapper.get('.stage-bounds').findComponent(EditorLoadingFrame).props('aspectRatio')).toBe(3 / 2);
    wrapper.findComponent(ScreenshotToolbar).vm.$emit('resize', 90);
  });
  it('never guesses a 16:9 frame before actual output dimensions are known', async () => {
    const wrapper = create();
    expect(wrapper.find('.loading-canvas-frame').exists()).toBe(false);
    await wrapper.setProps({ aspectRatio: 9 / 16 });
    expect(wrapper.get('.loading-canvas-frame').attributes('style')).toContain('--loading-aspect-ratio: 0.5625');
  });
  it('keeps the same scaled titlebar space when the underlying titlebar already exists', async () => {
    const wrapper = create({ showTopbarSkeleton: false });
    expect(wrapper.find('.editor-titlebar').exists()).toBe(false);
    expect(wrapper.find('.loading-titlebar-spacer').exists()).toBe(true);
    expect(wrapper.findComponent(EditorLoadingLayout).exists()).toBe(true);
  });
  it('fades out for 160ms and cancels an obsolete exit when loading resumes', async () => {
    vi.useFakeTimers();
    const wrapper = create({ visible: false });
    expect(wrapper.find('[role="status"]').exists()).toBe(false);
    await wrapper.setProps({ visible: true });
    await wrapper.setProps({ visible: false });
    expect(wrapper.get('[role="status"]').classes()).toContain('is-leaving');
    await vi.advanceTimersByTimeAsync(80);
    await wrapper.setProps({ visible: true });
    await vi.advanceTimersByTimeAsync(200);
    expect(wrapper.find('[role="status"]').exists()).toBe(true);
    await wrapper.setProps({ visible: false });
    await vi.advanceTimersByTimeAsync(160);
    expect(wrapper.find('[role="status"]').exists()).toBe(false);
  });
  it('removes the overlay immediately when reduced motion is enabled', async () => {
    vi.stubGlobal('matchMedia', (media: string) => ({
      media,
      matches: true,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    }));
    const wrapper = create();
    await wrapper.setProps({ visible: false });
    expect(wrapper.find('[role="status"]').exists()).toBe(false);
  });
  it('cancels an outstanding exit on unmount', async () => {
    vi.useFakeTimers();
    const wrapper = create();
    await wrapper.setProps({ visible: false });
    const element = wrapper.get('[role="status"]').element;
    wrapper.unmount();
    await vi.runAllTimersAsync();
    await flushPromises();
    expect(element.isConnected).toBe(false);
  });
});
