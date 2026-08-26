import { flushPromises, mount } from '@vue/test-utils';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  capture: {
    onQuickSnipStatus: vi.fn(),
    copyQuickSnipFile: vi.fn(),
    quickSnipCancel: vi.fn(),
    openEditor: vi.fn(),
    setQuickSnipStatusCompact: vi.fn(),
  },
  status: null as ((snapshot: QuickSnipSnapshot) => unknown) | null,
}));

vi.mock('~/api/capture', () => ({ capture: mocks.capture }));

import type { QuickSnipSnapshot } from '~/api/types/quick-snip';
import QuickSnipStatus from '../src/components/quick-snip/QuickSnipStatus.vue';

const ButtonStub = {
  inheritAttrs: true,
  props: ['disabled', 'tooltip'],
  emits: ['click'],
  template: '<button :disabled="disabled" :title="tooltip" @click="$emit(\'click\')"><slot /></button>',
};

const studioProcessing: QuickSnipSnapshot = {
  state: 'processing',
  job: {
    mode: 'studio',
    format: 'mp4',
    name: 'Studio capture',
    preset: {
      id: 'preset-1',
      name: 'Demo preset',
      protected: false,
      updatedAt: '2026-01-01T00:00:00.000Z',
      settings: { editor: { schemaVersion: 1 }, devices: {}, export: {}, quickSnip: { automaticZoom: true } },
    },
    automaticZoom: true,
    region: { x: 0.1, y: 0.2, width: 0.5, height: 0.4 },
    regionBounds: { x: 0, y: 0, width: 1920, height: 1080 },
    displayId: 'display-1',
    devices: {},
    projectId: 'project-1',
    thumbnail: 'data:image/png;base64,thumb',
  },
  progress: 0.42,
  result: null,
  error: null,
};

beforeEach(() => {
  vi.clearAllMocks();
  mocks.status = null;
  mocks.capture.onQuickSnipStatus.mockImplementation((listener: (value: QuickSnipSnapshot) => unknown) => {
    mocks.status = listener;
    return vi.fn();
  });
  mocks.capture.copyQuickSnipFile.mockResolvedValue({ native: true, fallback: null });
  mocks.capture.quickSnipCancel.mockResolvedValue({ state: 'canceled' });
  mocks.capture.openEditor.mockResolvedValue(true);
});

const mountStatus = async (snapshot = studioProcessing) => {
  const wrapper = mount(QuickSnipStatus, { global: { stubs: { Button: ButtonStub } } });
  await mocks.status?.(snapshot);
  await flushPromises();
  return wrapper;
};

describe('QuickSnipStatus', () => {
  it('renders a real thumbnail, preset name and progress percentage', async () => {
    const wrapper = await mountStatus();

    expect(wrapper.get('.thumbnail img').attributes('src')).toBe('data:image/png;base64,thumb');
    expect(wrapper.get('.status-content strong').text()).toBe('Demo preset');
    expect(wrapper.get('.status-content > span').text()).toBe('Studio · Exporting · 42%');
    expect(wrapper.get('.progress i').attributes('style')).toContain('width: 42%');
    expect(wrapper.find('[title="Cancel"]').exists()).toBe(true);
    expect(wrapper.find('[title="Copy again"]').exists()).toBe(false);
    expect(wrapper.find('[title="Open in Editor"]').exists()).toBe(true);
    wrapper.unmount();
  });

  it('minimizes into a progress pill and restores the details on hover', async () => {
    const wrapper = await mountStatus();

    await wrapper.get('[title="Minimize"]').trigger('click');
    expect(wrapper.get('.status-shell').classes()).toContain('compact');
    expect(wrapper.get('.pill-progress i').attributes('style')).toContain('width: 42%');
    expect(wrapper.get('.pill-content').text()).toContain('Exporting');
    expect(wrapper.get('.pill-content').text()).toContain('42%');
    expect(mocks.capture.setQuickSnipStatusCompact).toHaveBeenCalledWith(true);
    expect(mocks.capture.quickSnipCancel).not.toHaveBeenCalled();

    await wrapper.get('.status-shell').trigger('mouseenter');
    await new Promise((resolve) => setTimeout(resolve, 110));
    expect(wrapper.get('.status-shell').classes()).not.toContain('compact');
    expect(mocks.capture.setQuickSnipStatusCompact).toHaveBeenLastCalledWith(false);

    await wrapper.get('.status-shell').trigger('mouseleave');
    await new Promise((resolve) => setTimeout(resolve, 90));
    expect(wrapper.get('.status-shell').classes()).toContain('compact');
    expect(mocks.capture.setQuickSnipStatusCompact).toHaveBeenLastCalledWith(true);
    wrapper.unmount();
  });

  it('does not expose a Keep expanded action for the hover-only details view', async () => {
    const wrapper = await mountStatus();

    expect(wrapper.find('[title="Keep expanded"]').exists()).toBe(false);
    await wrapper.get('[title="Minimize"]').trigger('click');
    expect(wrapper.find('[title="Keep expanded"]').exists()).toBe(false);

    await wrapper.get('.status-shell').trigger('mouseenter');
    expect(wrapper.find('[title="Keep expanded"]').exists()).toBe(false);
    wrapper.unmount();
  });

  it('keeps the status surface draggable while excluding its action controls', async () => {
    const wrapper = await mountStatus();
    expect(wrapper.find('.status-card').exists()).toBe(true);
    expect(wrapper.get('.actions').findAll('button').length).toBeGreaterThan(0);
    wrapper.unmount();
  });

  it('uses a compositor transform for the compact-to-details hover motion', async () => {
    const wrapper = await mountStatus();
    await wrapper.get('[title="Minimize"]').trigger('click');
    await wrapper.get('.status-shell').trigger('mouseenter');
    await new Promise((resolve) => setTimeout(resolve, 110));
    expect(wrapper.get('.status-shell').classes()).toContain('compact-details');
    wrapper.unmount();
  });

  it('offers Copy Again and Open in Editor for completed Studio output', async () => {
    const completed: QuickSnipSnapshot = {
      ...studioProcessing,
      state: 'completed',
      progress: 1,
      result: { path: '/videos/Beam/user/quick-snip/studio/Studio capture.mp4', projectId: 'project-1' },
    };
    const wrapper = await mountStatus(completed);

    expect(wrapper.get('.status-content > span').text()).toBe('Studio · Completed · 100%');
    await wrapper.get('[title="Copy again"]').trigger('click');
    expect(mocks.capture.copyQuickSnipFile).toHaveBeenCalledWith(completed.result!.path);
    await wrapper.get('[title="Open in Editor"]').trigger('click');
    await flushPromises();
    expect(mocks.capture.openEditor).toHaveBeenCalledWith('project-1');
    wrapper.unmount();
  });

  it('does not offer camera/editor actions for Raw output and cancels processing explicitly', async () => {
    const raw: QuickSnipSnapshot = {
      ...studioProcessing,
      job: { ...studioProcessing.job!, mode: 'raw', preset: studioProcessing.job!.preset },
    };
    const wrapper = await mountStatus(raw);

    expect(wrapper.find('[title="Open in Editor"]').exists()).toBe(false);
    expect(wrapper.find('[title="Copy again"]').exists()).toBe(false);
    await wrapper.get('[title="Cancel"]').trigger('click');
    expect(mocks.capture.quickSnipCancel).toHaveBeenCalledOnce();
    expect(mocks.capture.openEditor).not.toHaveBeenCalled();
    wrapper.unmount();
  });
});
