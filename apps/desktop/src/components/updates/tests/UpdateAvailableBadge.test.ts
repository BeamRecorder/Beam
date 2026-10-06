import { flushPromises, mount } from '@vue/test-utils';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import UpdateAvailableBadge from '../UpdateAvailableBadge.vue';
import type { AppUpdateState } from '~/api/types/capture-api';

const captureMock = vi.hoisted(() => ({
  getUpdateState: vi.fn(),
  onUpdateState: vi.fn(),
  listener: undefined as ((state: AppUpdateState) => void) | undefined,
  stopListening: vi.fn(),
}));

vi.mock('~/api/capture', () => ({ capture: captureMock }));

const update = (status: AppUpdateState['status']): AppUpdateState => ({
  status,
  currentVersion: '1.0.0',
  availableVersion: '1.1.0',
  percent: 50,
  message: null,
});

beforeEach(() => {
  vi.clearAllMocks();
  captureMock.listener = undefined;
  captureMock.onUpdateState.mockImplementation((listener: (next: AppUpdateState) => void) => {
    captureMock.listener = listener;
    return captureMock.stopListening;
  });
});

describe('UpdateAvailableBadge', () => {
  it('shows only actionable update statuses and unregisters its listener', async () => {
    captureMock.getUpdateState.mockResolvedValue(update('idle'));
    const wrapper = mount(UpdateAvailableBadge);
    await flushPromises();
    expect(wrapper.find('.update-badge').exists()).toBe(false);

    for (const status of ['available', 'downloading', 'downloaded'] as const) {
      captureMock.listener?.(update(status));
      await wrapper.vm.$nextTick();
      expect(wrapper.find('.update-badge').exists()).toBe(true);
      expect(wrapper.find('.update-badge').attributes('title')).toContain('1.1.0');
    }
    captureMock.listener?.({ ...update('error'), availableVersion: null });
    await wrapper.vm.$nextTick();
    expect(wrapper.find('.update-badge').exists()).toBe(false);
    wrapper.unmount();
    expect(captureMock.stopListening).toHaveBeenCalledOnce();
  });
  it('retains the update indicator when a known update failed to download', async () => {
    captureMock.getUpdateState.mockResolvedValue(update('error'));
    const wrapper = mount(UpdateAvailableBadge, { props: { inline: true } });
    await flushPromises();
    expect(wrapper.get('.badge-inline').attributes('aria-label')).toContain('1.1.0');
    expect(wrapper.get('.badge-inline').attributes('title')).toBeUndefined();
    wrapper.unmount();
  });
  it('uses a generic accessible label when a version has not arrived', async () => {
    captureMock.getUpdateState.mockResolvedValue({ ...update('available'), availableVersion: null });
    const wrapper = mount(UpdateAvailableBadge);
    await flushPromises();
    expect(wrapper.get('[role="img"]').attributes('aria-label')).toBe('An update is available.');
    wrapper.unmount();
  });
});
