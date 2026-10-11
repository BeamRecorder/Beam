import { defineComponent } from 'vue';
import { enableAutoUnmount, flushPromises, mount } from '@vue/test-utils';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { AppUpdateState } from '~/api/types/capture-api';
import { useAppUpdates } from '../useAppUpdates';

enableAutoUnmount(afterEach);
const mock = vi.hoisted(() => ({
  getUpdateState: vi.fn(),
  onUpdateState: vi.fn(),
  checkForUpdates: vi.fn(),
  downloadUpdate: vi.fn(),
  quitAndInstallUpdate: vi.fn(),
  stop: vi.fn(),
  listener: undefined as ((state: AppUpdateState) => void) | undefined,
}));
vi.mock('~/api/capture', () => ({ capture: mock }));
const value = (status: AppUpdateState['status'], availableVersion: string | null = '0.5.3'): AppUpdateState => ({
  status,
  currentVersion: '0.5.2',
  availableVersion,
  percent: null,
  message: null,
});
const Host = defineComponent({ setup: useAppUpdates, template: '<div />' });
beforeEach(() => {
  vi.clearAllMocks();
  mock.listener = undefined;
  mock.getUpdateState.mockResolvedValue(value('available'));
  mock.onUpdateState.mockImplementation((listener: (state: AppUpdateState) => void) => {
    mock.listener = listener;
    return mock.stop;
  });
  mock.checkForUpdates.mockResolvedValue(value('not-available', null));
  mock.downloadUpdate.mockResolvedValue(true);
  mock.quitAndInstallUpdate.mockResolvedValue(true);
});

describe('update state and actions', () => {
  it('hydrates, follows live events and releases its listener', async () => {
    const wrapper = mount(Host);
    await flushPromises();
    expect(wrapper.vm.attention).toBe(true);
    mock.listener?.(value('downloaded'));
    expect(wrapper.vm.state?.status).toBe('downloaded');
    wrapper.unmount();
    expect(mock.stop).toHaveBeenCalledOnce();
    mock.listener?.(value('idle'));
    expect(wrapper.vm.state?.status).toBe('downloaded');
  });
  it('keeps a newer event when initial IPC resolves later', async () => {
    let resolve!: (state: AppUpdateState) => void;
    mock.getUpdateState.mockReturnValue(
      new Promise<AppUpdateState>((done) => {
        resolve = done;
      }),
    );
    const wrapper = mount(Host);
    mock.listener?.(value('downloaded'));
    resolve(value('available'));
    await flushPromises();
    expect(wrapper.vm.state?.status).toBe('downloaded');
  });
  it('ignores initial IPC after unmount', async () => {
    let resolve!: (state: AppUpdateState) => void;
    mock.getUpdateState.mockReturnValue(
      new Promise<AppUpdateState>((done) => {
        resolve = done;
      }),
    );
    const wrapper = mount(Host);
    wrapper.unmount();
    resolve(value('available'));
    await flushPromises();
    expect(wrapper.vm.state).toBeNull();
  });
  it.each([new Error('offline'), 'offline'])('exposes initial IPC failures (%s)', async (reason) => {
    mock.getUpdateState.mockRejectedValueOnce(reason);
    const wrapper = mount(Host);
    await flushPromises();
    expect(wrapper.vm.error).toBe('offline');
    mock.listener?.(value('available'));
    expect(wrapper.vm.error).toBe('');
  });
  it('ignores a rejected initial request after unmount', async () => {
    let reject!: (reason: Error) => void;
    mock.getUpdateState.mockReturnValue(
      new Promise((_resolve, fail) => {
        reject = fail;
      }),
    );
    const wrapper = mount(Host);
    wrapper.unmount();
    reject(new Error('late failure'));
    await flushPromises();
    expect(wrapper.vm.error).toBe('');
  });
  it.each(['idle', 'checking', 'not-available', 'unsupported'] as const)('keeps %s quiet', async (status) => {
    mock.getUpdateState.mockResolvedValue(value(status, null));
    const wrapper = mount(Host);
    await flushPromises();
    expect(wrapper.vm.attention).toBe(false);
  });
  it.each(['available', 'downloading', 'downloaded', 'error'] as const)(
    'keeps the known update visible in %s',
    async (status) => {
      mock.getUpdateState.mockResolvedValue(value(status));
      const wrapper = mount(Host);
      await flushPromises();
      expect(wrapper.vm.attention).toBe(true);
    },
  );
  it.each(['check', 'download', 'restart'] as const)('does not %s before state is loaded', async (action) => {
    mock.getUpdateState.mockReturnValue(new Promise(() => undefined));
    const wrapper = mount(Host);
    await wrapper.vm.perform(action);
    expect(mock.checkForUpdates).not.toHaveBeenCalled();
    expect(mock.downloadUpdate).not.toHaveBeenCalled();
    expect(mock.quitAndInstallUpdate).not.toHaveBeenCalled();
  });
  it.each([
    ['check', 'unsupported'],
    ['check', 'checking'],
    ['check', 'downloading'],
    ['check', 'downloaded'],
    ['download', 'idle'],
    ['download', 'downloaded'],
    ['restart', 'available'],
    ['restart', 'error'],
  ] as const)('rejects %s while %s', async (action, status) => {
    mock.getUpdateState.mockResolvedValue(value(status));
    const wrapper = mount(Host);
    await flushPromises();
    await wrapper.vm.perform(action);
    expect(mock.checkForUpdates).not.toHaveBeenCalled();
    expect(mock.downloadUpdate).not.toHaveBeenCalled();
    expect(mock.quitAndInstallUpdate).not.toHaveBeenCalled();
  });
  it('refreshes from the check result when no event arrived', async () => {
    const wrapper = mount(Host);
    await flushPromises();
    await wrapper.vm.perform('check');
    expect(wrapper.vm.state?.status).toBe('not-available');
  });
  it('preserves newer progress over a delayed check result', async () => {
    mock.checkForUpdates.mockImplementation(async () => {
      mock.listener?.(value('downloading'));
      return value('available');
    });
    const wrapper = mount(Host);
    await flushPromises();
    await wrapper.vm.perform('check');
    expect(wrapper.vm.state?.status).toBe('downloading');
  });
  it.each(['download', 'restart'] as const)('runs %s once while its request is pending', async (action) => {
    mock.getUpdateState.mockResolvedValue(value(action === 'download' ? 'available' : 'downloaded'));
    const api = action === 'download' ? mock.downloadUpdate : mock.quitAndInstallUpdate;
    let resolve!: (success: boolean) => void;
    api.mockReturnValueOnce(
      new Promise<boolean>((done) => {
        resolve = done;
      }),
    );
    const wrapper = mount(Host);
    await flushPromises();
    const first = wrapper.vm.perform(action);
    expect(wrapper.vm.pending).toBe(true);
    await wrapper.vm.perform(action);
    expect(api).toHaveBeenCalledOnce();
    resolve(true);
    await first;
    expect(wrapper.vm.pending).toBe(false);
  });
  it.each([new Error('denied'), 'denied'])('exposes action failures and allows retry (%s)', async (reason) => {
    mock.downloadUpdate.mockRejectedValueOnce(reason);
    const wrapper = mount(Host);
    await flushPromises();
    await wrapper.vm.perform('download');
    expect(wrapper.vm.error).toBe('denied');
    expect(wrapper.vm.pending).toBe(false);
    await wrapper.vm.perform('download');
    expect(mock.downloadUpdate).toHaveBeenCalledTimes(2);
    expect(wrapper.vm.error).toBe('');
  });
  it('retries a failed known download but never an unknown one', async () => {
    mock.getUpdateState.mockResolvedValue(value('error'));
    const wrapper = mount(Host);
    await flushPromises();
    await wrapper.vm.perform('download');
    expect(mock.downloadUpdate).toHaveBeenCalledOnce();
    mock.listener?.(value('error', null));
    await wrapper.vm.perform('download');
    expect(mock.downloadUpdate).toHaveBeenCalledOnce();
    expect(wrapper.vm.attention).toBe(false);
  });
  it('does not change error or pending state after unmount', async () => {
    let reject!: (reason: Error) => void;
    mock.downloadUpdate.mockReturnValueOnce(
      new Promise((_resolve, fail) => {
        reject = fail;
      }),
    );
    const wrapper = mount(Host);
    await flushPromises();
    const task = wrapper.vm.perform('download');
    wrapper.unmount();
    reject(new Error('late'));
    await task;
    expect(wrapper.vm.error).toBe('');
  });
});
