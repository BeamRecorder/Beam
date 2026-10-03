import { enableAutoUnmount, mount } from '@vue/test-utils';
import { afterEach, expect, it, vi } from 'vitest';
import { ref } from 'vue';
import ScreenshotCompositionSkeleton from './ScreenshotCompositionSkeleton.vue';
const state = vi.hoisted(() => ({ ready: true, upward: false }));
vi.mock('~/api/capture', () => ({ capture: {} }));
vi.mock('../../screenshot/composition/useCompositionPanelPosition', () => ({
  useCompositionPanelPosition: (_panel: unknown, toggle: () => void) => {
    toggle();
    return { ready: ref(state.ready), upward: ref(state.upward) };
  },
}));
enableAutoUnmount(afterEach);
afterEach(() => {
  vi.unstubAllGlobals();
  state.ready = true;
  state.upward = false;
});
const create = () =>
  mount(ScreenshotCompositionSkeleton, {
    global: { stubs: { EditorSkeletonSurface: { template: '<div><slot /></div>' } } },
  });
it('uses the actual Composition shell and controls with placeholder rows before layer metadata arrives', () => {
  const wrapper = create();
  expect(wrapper.find('.composition-surface.screenshot-chrome').exists()).toBe(true);
  expect(wrapper.findAll('.layer-row')).toHaveLength(3);
  expect(wrapper.find('.compositing-controls').exists()).toBe(true);
});
it('matches the collapsed compact layout without keeping an expanded body', () => {
  vi.stubGlobal('matchMedia', (media: string) => ({
    media,
    matches: true,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  }));
  expect(create().find('.composition-content').exists()).toBe(false);
});
it('keeps content measurable during initial placement and preserves the shared upward layout', () => {
  state.ready = false;
  state.upward = true;
  vi.stubGlobal('matchMedia', (media: string) => ({
    media,
    matches: true,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  }));
  const wrapper = create();
  expect(wrapper.get('.screenshot-composition').classes()).toEqual(expect.arrayContaining(['positioning', 'upward']));
  expect(wrapper.find('.composition-content').exists()).toBe(true);
});
