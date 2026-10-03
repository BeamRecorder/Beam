import { mount } from '@vue/test-utils';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import Topbar from '../Topbar.vue';
import type { EditorExportSource } from '@beam/encoder/export-types';
import type { CompositionSnapshot } from '@beam/engine/shared/render-document-types';
import type { PreviewPerformanceSnapshot } from '../performance/preview-performance-types';

const capture = vi.hoisted(() => ({
  openDiscordInvite: vi.fn(),
}));

vi.mock('../../../api/capture', () => ({ capture }));
vi.mock('../../export/ExportPopover.vue', () => ({
  default: {
    props: ['request', 'playheadSeconds'],
    template:
      '<div class="export-popover-stub" :data-project-name="request?.projectName" :data-duration="request?.duration" :data-playhead="playheadSeconds" />',
  },
}));
vi.mock('../VideoProjectEdition.vue', () => ({
  default: { template: '<div class="project-switcher-stub" />' },
}));

describe('VideoEditor Topbar', () => {
  beforeEach(() => vi.clearAllMocks());

  it('keeps community shortcuts out of the editing titlebar', () => {
    const wrapper = mount(Topbar);
    expect(wrapper.find('[aria-label="Open Beam Discord"]').exists()).toBe(false);
    expect(wrapper.find('.discord-icon').exists()).toBe(false);
    expect(wrapper.get('.brand-logo').attributes('alt')).toBe('Beam');
  });

  it('places presets on the left and project navigation in the center', () => {
    const wrapper = mount(Topbar);
    expect(wrapper.find('.left-actions .preset-controls').exists()).toBe(true);
    expect(wrapper.find('.center-actions .project-switcher-stub').exists()).toBe(true);
    expect(wrapper.find('.right-actions .preset-controls').exists()).toBe(false);
    wrapper.unmount();
  });

  it('emits navigation back to the HUD', async () => {
    const wrapper = mount(Topbar);

    await wrapper.get('.exit-btn').trigger('click');

    expect(wrapper.emitted('back-to-hud')).toHaveLength(1);
  });

  it('passes live export metadata and playhead through without asking for a snapshot', () => {
    const createSnapshot = vi.fn(() => ({}) as CompositionSnapshot);
    const exportRequest: EditorExportSource = {
      projectName: 'Demo project',
      includeAudio: true,
      duration: 24,
      fps: 30,
      width: 1280,
      height: 720,
      createSnapshot,
    };
    const wrapper = mount(Topbar, {
      props: { exportRequest, playheadSeconds: 7.5 },
    });

    expect(wrapper.get('.export-popover-stub').attributes()).toMatchObject({
      'data-project-name': 'Demo project',
      'data-duration': '24',
      'data-playhead': '7.5',
    });
    expect(createSnapshot).not.toHaveBeenCalled();
    wrapper.unmount();
  });

  it('forwards undo and redo from the real shared history controls', async () => {
    const wrapper = mount(Topbar, { props: { canUndo: true, canRedo: true } });

    await wrapper.get('button[aria-label="Undo (Ctrl+Z)"]').trigger('click');
    await wrapper.get('button[aria-label="Redo (Ctrl+Y)"]').trigger('click');

    expect(wrapper.emitted('undo')).toHaveLength(1);
    expect(wrapper.emitted('redo')).toHaveLength(1);
    wrapper.unmount();
  });

  it('keeps an explicit native drag region between the Beam actions', () => {
    const wrapper = mount(Topbar);

    expect(wrapper.get('.titlebar-drag-region').attributes('aria-hidden')).toBe('true');
  });

  it('leaves minimize, maximize, Snap Layout and close to the native overlay', () => {
    const wrapper = mount(Topbar);

    expect(wrapper.find('.window-controls').exists()).toBe(false);
    expect(wrapper.find('[aria-label="Maximize"]').exists()).toBe(false);
  });

  it('keeps preview diagnostics out of the titlebar for idle and active snapshots', () => {
    const PerformanceWidgetStub = {
      props: ['snapshot'],
      template: '<div class="preview-performance-widget-stub" :data-status="snapshot.status" />',
    };
    const snapshot = {
      status: 'warning',
      scores: { ui: 0.6, worker: 0.2, audio: 0.1, media: 0.2 },
      activity: { playback: true, media: true },
      samples: [],
      issues: ['ui'],
      recommendation: 'half',
    } satisfies PreviewPerformanceSnapshot;

    const idleWrapper = mount(Topbar, {
      props: {
        performanceSnapshot: { ...snapshot, status: 'idle' },
      },
      global: { stubs: { PreviewPerformanceWidget: PerformanceWidgetStub } },
    });
    expect(idleWrapper.find('.preview-performance-widget-stub').exists()).toBe(false);

    const activeWrapper = mount(Topbar, {
      props: { performanceSnapshot: { ...snapshot, status: 'good' } },
      global: { stubs: { PreviewPerformanceWidget: PerformanceWidgetStub } },
    });
    expect(activeWrapper.find('.preview-performance-widget-stub').exists()).toBe(false);
  });
});
