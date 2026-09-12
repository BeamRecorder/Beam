import { flushPromises, mount } from '@vue/test-utils';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { setCurrentLocale } from '~/i18n';

const capture = vi.hoisted(() => ({
  getQuickSnipState: vi.fn(),
  getQuickSnipRenderTask: vi.fn(),
  onQuickSnipStatus: vi.fn(() => () => {}),
  onQuickSnipStatusBlur: vi.fn(),
  onQuickSnipRenderTask: vi.fn(() => () => {}),
  setQuickSnipStatusInteractive: vi.fn(),
  notifyQuickSnipStatusReady: vi.fn(),
}));
vi.mock('~/api/capture', () => ({ capture }));
vi.mock('./quick-snip-export', () => ({ renderQuickSnip: vi.fn() }));
vi.mock('../video-editor/screenshot/screenshot-render', () => ({ encodeScreenshot: vi.fn() }));
import QuickSnipStatus from './QuickSnipStatus.vue';

const removeStatusBlur = vi.fn();

beforeEach(() => {
  vi.clearAllMocks();
  capture.onQuickSnipStatusBlur.mockReturnValue(removeStatusBlur);
  capture.getQuickSnipRenderTask.mockResolvedValue(null);
});

describe('quick capture status labels', () => {
  it.each([
    ['screenshot', 'preparing', 'Preparing image'],
    ['screenshot', 'processing', 'Exporting image'],
    ['screenshot', 'completed', 'Image ready'],
    ['instant', 'preparing', 'Preparing video'],
    ['instant', 'processing', 'Exporting video'],
    ['instant', 'completed', 'Video ready'],
  ])('describes %s while %s', async (mode, state, label) => {
    capture.getQuickSnipState.mockResolvedValue({
      state,
      job: { mode, preset: { id: 'default', name: 'Default' }, format: 'mp4' },
      progress: 0,
      result: null,
      error: null,
    });
    const wrapper = mount(QuickSnipStatus);
    await flushPromises();
    expect(wrapper.text()).toContain(label);
    wrapper.unmount();
  });
  it('localizes screenshot progress and the built-in preset name', async () => {
    setCurrentLocale('fr');
    capture.getQuickSnipState.mockResolvedValue({
      state: 'processing',
      job: { mode: 'screenshot', preset: { id: 'default', name: 'Default' } },
      progress: 0,
      result: null,
      error: null,
    });
    const wrapper = mount(QuickSnipStatus);
    await flushPromises();
    expect(wrapper.text()).toContain('Exportation de l’image');
    expect(wrapper.text()).not.toContain('Default');
    wrapper.unmount();
  });

  it('notifies the native window only after the initial snapshot has hydrated', async () => {
    let resolveInitialState!: (state: unknown) => void;
    capture.getQuickSnipState.mockReturnValueOnce(
      new Promise((resolve) => {
        resolveInitialState = resolve;
      }),
    );
    const wrapper = mount(QuickSnipStatus);
    await flushPromises();

    expect(capture.notifyQuickSnipStatusReady).not.toHaveBeenCalled();
    expect(wrapper.get('[role="progressbar"]').attributes('aria-valuenow')).not.toBe('40');

    resolveInitialState({
      state: 'processing',
      job: { mode: 'studio', preset: { id: 'default', name: 'Default' }, format: 'mp4' },
      progress: 0.4,
      result: null,
      error: null,
    });
    await flushPromises();

    expect(wrapper.get('[role="progressbar"]').attributes('aria-valuenow')).toBe('40');
    expect(capture.notifyQuickSnipStatusReady).toHaveBeenCalledOnce();
    expect(capture.onQuickSnipStatusBlur).toHaveBeenCalledWith(expect.any(Function));

    wrapper.unmount();
    expect(removeStatusBlur).toHaveBeenCalledOnce();
  });
});
