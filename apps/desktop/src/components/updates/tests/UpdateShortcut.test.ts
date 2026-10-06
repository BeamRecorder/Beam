import { enableAutoUnmount, flushPromises, mount } from '@vue/test-utils';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ref } from 'vue';
import { useReducedMotion } from '@vueuse/motion';
import type { AppUpdateState } from '~/api/types/capture-api';
import { setCurrentLocale } from '~/i18n';
import { SUPPORTED_LOCALES } from '~/i18n/locales';
import UpdateShortcut from '../UpdateShortcut.vue';
enableAutoUnmount(afterEach);
afterEach(() => vi.useRealTimers());
vi.mock('@vueuse/motion', () => ({ useReducedMotion: vi.fn(() => ({ value: false })) }));
const stubs = {
  teleport: true,
  Throbber: { props: ['text'], template: '<span class="test-update-shimmer">{{ text }}</span>' },
};
const mock = vi.hoisted(() => ({
  getUpdateState: vi.fn(),
  onUpdateState: vi.fn(),
  downloadUpdate: vi.fn(),
  quitAndInstallUpdate: vi.fn(),
  listeners: new Set<(state: AppUpdateState) => void>(),
}));
vi.mock('~/api/capture', () => ({ capture: mock }));
const state = (status: AppUpdateState['status'], percent: number | null = null): AppUpdateState => ({
  status,
  currentVersion: '0.5.2',
  availableVersion: '0.5.3',
  percent,
  message: null,
});
const receive = (next: AppUpdateState) => {
  mock.getUpdateState.mockResolvedValue(next);
  for (const listener of mock.listeners) listener(next);
};
const create = () => mount(UpdateShortcut, { global: { stubs } });
beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(useReducedMotion).mockReturnValue(ref(false));
  mock.listeners.clear();
  mock.getUpdateState.mockResolvedValue(state('available'));
  mock.onUpdateState.mockImplementation((listener: (state: AppUpdateState) => void) => {
    mock.listeners.add(listener);
    return () => mock.listeners.delete(listener);
  });
  mock.downloadUpdate.mockResolvedValue(true);
  mock.quitAndInstallUpdate.mockResolvedValue(true);
});
describe('Recorder update shortcut', () => {
  it('explains the version and background download on hover before any action', async () => {
    const wrapper = create();
    await flushPromises();
    expect(wrapper.get('.popover-trigger button').text()).toBe('Update');
    expect(wrapper.get('.popover-trigger button').attributes('aria-expanded')).toBe('false');
    await wrapper.get('.popover-trigger').trigger('mouseenter');
    await flushPromises();
    expect(wrapper.get('[role="dialog"]').text()).toContain('0.5.3');
    expect(wrapper.get('.update-hint').text()).toContain('keep working');
    expect(mock.downloadUpdate).not.toHaveBeenCalled();
    await wrapper.get('.update-actions button').trigger('click');
    expect(mock.downloadUpdate).toHaveBeenCalledOnce();
    expect(mock.quitAndInstallUpdate).not.toHaveBeenCalled();
  });
  it('opens from keyboard focus or click without downloading and reports opening to the HUD', async () => {
    const onToggle = vi.fn();
    const wrapper = mount(UpdateShortcut, { props: { onToggle }, global: { stubs } });
    await flushPromises();
    await wrapper.get('.popover-trigger').trigger('focusin');
    await flushPromises();
    expect(wrapper.find('[role="dialog"]').exists()).toBe(true);
    expect(wrapper.emitted('toggle')).toEqual([[true]]);
    await wrapper.get('.popover-trigger button').trigger('click');
    await flushPromises();
    expect(mock.downloadUpdate).not.toHaveBeenCalled();
    expect(wrapper.get('.popover-trigger button').attributes('aria-expanded')).toBe('true');
    wrapper.unmount();
    expect(onToggle.mock.calls).toEqual([[true], [false]]);
  });
  it('keeps progress accessible, then explains the restart before installation', async () => {
    const wrapper = create();
    await flushPromises();
    receive(state('downloading', 42));
    await wrapper.vm.$nextTick();
    expect(wrapper.get('.popover-trigger button').text()).toBe('Downloading 42%');
    await wrapper.get('.popover-trigger button').trigger('click');
    await flushPromises();
    expect(wrapper.get('progress').attributes('value')).toBe('42');
    expect(wrapper.get('.update-actions button').attributes('disabled')).toBeDefined();
    receive(state('downloaded', 100));
    await flushPromises();
    expect(wrapper.get('.popover-trigger button').text()).toBe('Restart to update');
    expect(wrapper.get('.update-hint').text()).toContain('when you’re ready');
    expect(mock.quitAndInstallUpdate).not.toHaveBeenCalled();
    await wrapper.get('.update-actions button').trigger('click');
    expect(mock.quitAndInstallUpdate).toHaveBeenCalledOnce();
  });
  it('uses zero before a progress percentage is available', async () => {
    mock.getUpdateState.mockResolvedValue(state('downloading'));
    const wrapper = create();
    await flushPromises();
    expect(wrapper.get('.popover-trigger button').text()).toBe('Downloading 0%');
  });
  it.each(['idle', 'checking', 'not-available', 'unsupported'] as const)('stays hidden while %s', async (status) => {
    mock.getUpdateState.mockResolvedValue(state(status));
    const wrapper = create();
    await flushPromises();
    expect(wrapper.find('button').exists()).toBe(false);
  });
  it('respects a busy Recorder', async () => {
    const wrapper = mount(UpdateShortcut, { props: { disabled: true }, global: { stubs } });
    await flushPromises();
    await wrapper.get('.popover-trigger').trigger('mouseenter');
    expect(wrapper.find('[role="dialog"]').exists()).toBe(false);
    expect(wrapper.get('.popover-trigger button').attributes('disabled')).toBeDefined();
    expect(mock.downloadUpdate).not.toHaveBeenCalled();
  });
  it('keeps failed downloads available for retry', async () => {
    mock.getUpdateState.mockResolvedValue(state('error'));
    const wrapper = create();
    await flushPromises();
    expect(wrapper.get('.popover-trigger button').text()).toBe('Retry update');
    await wrapper.get('.popover-trigger button').trigger('click');
    await flushPromises();
    await wrapper.get('.update-actions button').trigger('click');
    expect(mock.downloadUpdate).toHaveBeenCalledOnce();
  });
  it('shows transport errors in the panel without hiding the retry action', async () => {
    mock.downloadUpdate.mockRejectedValueOnce(new Error('IPC disconnected'));
    const wrapper = create();
    await flushPromises();
    await wrapper.get('.popover-trigger button').trigger('click');
    await flushPromises();
    await wrapper.get('.update-actions button').trigger('click');
    await flushPromises();
    expect(wrapper.get('[role="alert"]').text()).toBe('IPC disconnected');
    expect(wrapper.get('.update-actions button').attributes('disabled')).toBeUndefined();
  });
  it.each(SUPPORTED_LOCALES)('translates available, progress, restart and explanations in %s', async (locale) => {
    await setCurrentLocale(locale);
    const wrapper = create();
    await flushPromises();
    await wrapper.get('.popover-trigger').trigger('mouseenter');
    await flushPromises();
    for (const status of ['available', 'downloading', 'downloaded', 'error'] as const) {
      receive(state(status, 73));
      await flushPromises();
      expect(wrapper.get('.popover-trigger button').text()).not.toContain('Updates.');
      expect(wrapper.get('[role="dialog"]').text()).not.toContain('Updates.');
      if (status === 'available' || status === 'downloaded') expect(wrapper.get('.update-hint').text()).not.toBe('');
      if (status === 'downloading') expect(wrapper.get('.popover-trigger button').text()).toContain('73');
    }
  });
});

describe('first update appearance', () => {
  it('highlights for exactly two seconds, then releases the animation', async () => {
    vi.useFakeTimers();
    const wrapper = create();
    await flushPromises();
    expect(wrapper.find('.test-update-shimmer').exists()).toBe(true);
    expect(wrapper.get('button').attributes('aria-label')).toBe('Update');
    await vi.advanceTimersByTimeAsync(1999);
    expect(wrapper.find('.test-update-shimmer').exists()).toBe(true);
    await vi.advanceTimersByTimeAsync(1);
    expect(wrapper.find('.test-update-shimmer').exists()).toBe(false);
    expect(wrapper.get('button').text()).toBe('Update');
  });
  it('waits until an update is available before starting the highlight', async () => {
    vi.useFakeTimers();
    mock.getUpdateState.mockResolvedValue(state('checking'));
    const wrapper = create();
    await flushPromises();
    await vi.advanceTimersByTimeAsync(3000);
    expect(wrapper.find('.test-update-shimmer').exists()).toBe(false);
    receive(state('available'));
    await flushPromises();
    expect(wrapper.find('.test-update-shimmer').exists()).toBe(true);
  });
  it('does not restart the highlight on progress or a later state notification', async () => {
    vi.useFakeTimers();
    const wrapper = create();
    await flushPromises();
    await vi.advanceTimersByTimeAsync(1000);
    receive(state('downloading', 42));
    await flushPromises();
    expect(wrapper.get('.test-update-shimmer').text()).toBe('Downloading 42%');
    await vi.advanceTimersByTimeAsync(1000);
    expect(wrapper.find('.test-update-shimmer').exists()).toBe(false);
    receive(state('not-available'));
    await flushPromises();
    receive(state('available'));
    await flushPromises();
    expect(wrapper.find('.test-update-shimmer').exists()).toBe(false);
  });
  it('skips the animation and timer when reduced motion is preferred', async () => {
    vi.useFakeTimers();
    vi.mocked(useReducedMotion).mockReturnValue(ref(true));
    const wrapper = create();
    await flushPromises();
    expect(wrapper.find('.test-update-shimmer').exists()).toBe(false);
    expect(wrapper.get('button').text()).toBe('Update');
    expect(vi.getTimerCount()).toBe(0);
  });
  it('immediately stops displaying the animation when reduced motion is enabled', async () => {
    const reducedMotion = ref(false);
    vi.mocked(useReducedMotion).mockReturnValue(reducedMotion);
    const wrapper = create();
    await flushPromises();
    expect(wrapper.find('.test-update-shimmer').exists()).toBe(true);
    reducedMotion.value = true;
    await wrapper.vm.$nextTick();
    expect(wrapper.find('.test-update-shimmer').exists()).toBe(false);
  });
  it('clears its timer and updater subscription when unmounted', async () => {
    vi.useFakeTimers();
    const wrapper = create();
    await flushPromises();
    expect(vi.getTimerCount()).toBe(1);
    wrapper.unmount();
    expect(vi.getTimerCount()).toBe(0);
    expect(mock.listeners.size).toBe(0);
  });
});
