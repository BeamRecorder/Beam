import { flushPromises, mount } from '@vue/test-utils';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { setCurrentLocale } from '~/i18n';
import type { QuickSnipSnapshot } from '~/api/types/quick-snip';

const capture = vi.hoisted(() => ({
  getQuickSnipState: vi.fn(),
  getQuickSnipRenderTask: vi.fn(),
  onQuickSnipStatus: vi.fn((_receive: (snapshot: QuickSnipSnapshot) => void) => () => {}),
  onQuickSnipStatusBlur: vi.fn(),
  onQuickSnipRenderTask: vi.fn(() => () => {}),
  setQuickSnipStatusInteractive: vi.fn(),
  notifyQuickSnipStatusReady: vi.fn(),
}));
vi.mock('~/api/capture', () => ({ capture }));
vi.mock('./quick-snip-export', () => ({ renderQuickSnip: vi.fn() }));
vi.mock('../screenshot/screenshot-render', () => ({
  encodeScreenshot: vi.fn(),
}));
import QuickSnipStatus from './QuickSnipStatus.vue';
import BeamySvg from '../brand/Beamy/BeamySvg.vue';
import Beamy from '../brand/Beamy/Beamy.vue';

const removeStatusBlur = vi.fn();

beforeEach(() => {
  vi.clearAllMocks();
  capture.onQuickSnipStatusBlur.mockReturnValue(removeStatusBlur);
  capture.getQuickSnipRenderTask.mockResolvedValue(null);
});

describe('quick capture status labels', () => {
  it('retains one loading player across finalization and progress, celebrating only actual completion', async () => {
    const snapshot: QuickSnipSnapshot = {
      state: 'preparing',
      job: {
        name: 'instant-1',
        mode: 'instant',
        format: 'mp4',
        automaticZoom: true,
        screenKind: 'display',
        region: null,
        regionBounds: { x: 0, y: 0, width: 1920, height: 1080 },
        displayId: 'display-1',
        devices: {},
        preset: {
          id: 'default',
          name: 'Default',
          protected: true,
          updatedAt: '',
          settings: {
            editor: { schemaVersion: 1 },
            devices: {},
            export: { format: 'mp4' },
            quickSnip: { automaticZoom: true },
          },
        },
      },
      progress: 0,
      result: null,
      error: null,
    };
    capture.getQuickSnipState.mockResolvedValue(snapshot);
    const wrapper = mount(QuickSnipStatus);
    await flushPromises();
    const player = wrapper.getComponent(Beamy).element;
    const receive = capture.onQuickSnipStatus.mock.calls[0]![0];
    for (const [state, progress] of [
      ['finalizing', 0],
      ['processing', 0.4],
      ['processing', 1],
    ] as const) {
      receive({ ...snapshot, state, progress });
      await flushPromises();
      expect(wrapper.getComponent(Beamy).element).toBe(player);
      expect(wrapper.getComponent(Beamy).props('phase')).toBe('loading');
      expect(wrapper.getComponent(BeamySvg).props('color')).toBe('var(--color-primary)');
      expect(wrapper.getComponent(BeamySvg).props('frame').eyes).toHaveLength(0);
      expect(wrapper.find('.success-mark').exists()).toBe(false);
    }
    receive({ ...snapshot, state: 'completed', progress: 1 });
    await flushPromises();
    expect(wrapper.getComponent(Beamy).element).toBe(player);
    expect(wrapper.getComponent(Beamy).props('phase')).toBe('completed');
    expect(wrapper.getComponent(BeamySvg).props('color')).toBe('var(--color-success)');
    expect(wrapper.getComponent(BeamySvg).props('frame').dots).toHaveLength(12);
    expect(wrapper.find('.success-mark').exists()).toBe(true);
    wrapper.unmount();
  });
  it.each([
    ['preparing', 'loading'],
    ['finalizing', 'loading'],
    ['recording', 'recording'],
    ['processing', 'loading'],
    ['completed', 'completed'],
    ['failed', 'failed'],
  ])('ties the Instant mascot to actual %s state', async (state, phase) => {
    capture.getQuickSnipState.mockResolvedValue({
      state,
      job: {
        name: 'instant-1',
        mode: 'instant',
        preset: { id: 'default' },
        format: 'mp4',
      },
      progress: 0.48,
      result: null,
      error: null,
      preview: 'data:image/png;base64,abc',
    });
    const wrapper = mount(QuickSnipStatus);
    await flushPromises();
    expect(wrapper.get('.beam-mascot').attributes('data-phase')).toBe(phase);
    expect(wrapper.getComponent(BeamySvg).props('color')).toBe(
      state === 'completed' ? 'var(--color-success)' : 'var(--color-primary)',
    );
    expect(wrapper.get('.thumbnail img').attributes('src')).toBe('data:image/png;base64,abc');
    if (state === 'processing') {
      expect(wrapper.get('.mascot-percent').text()).toBe('48%');
      expect(wrapper.get('[role="progressbar"]').attributes('aria-valuenow')).toBe('48');
    }
    wrapper.unmount();
  });

  it.each(['studio', 'screenshot'])('leaves the %s status presentation without an Instant mascot', async (mode) => {
    capture.getQuickSnipState.mockResolvedValue({
      state: 'processing',
      job: { mode, preset: { id: 'default' }, format: 'mp4' },
      progress: 0.48,
      result: null,
      error: null,
    });
    const wrapper = mount(QuickSnipStatus);
    await flushPromises();
    expect(wrapper.find('.beam-mascot').exists()).toBe(false);
    expect(wrapper.get('.status-value').text()).toBe('48%');
    wrapper.unmount();
  });

  it('uses a quiet error pose when clipboard publication fails after encoding', async () => {
    capture.getQuickSnipState.mockResolvedValue({
      state: 'completed',
      job: {
        name: 'instant-1',
        mode: 'instant',
        preset: { id: 'default' },
        format: 'mp4',
      },
      progress: 1,
      result: null,
      error: null,
      clipboardError: 'Clipboard unavailable',
    });
    const wrapper = mount(QuickSnipStatus);
    await flushPromises();
    expect(wrapper.get('.beam-mascot').attributes('data-phase')).toBe('failed');
    expect(wrapper.getComponent(BeamySvg).props('color')).toBe('var(--color-primary)');
    expect(wrapper.find('.success-mark').exists()).toBe(false);
    expect(wrapper.classes()).not.toContain('completed');
    expect(wrapper.get('[role="alert"]').text()).toBe('Clipboard unavailable');
    wrapper.unmount();
  });
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
    await setCurrentLocale('fr');
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
      job: {
        mode: 'studio',
        preset: { id: 'default', name: 'Default' },
        format: 'mp4',
      },
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
