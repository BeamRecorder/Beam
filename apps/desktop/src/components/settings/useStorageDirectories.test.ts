import { enableAutoUnmount, flushPromises, mount } from '@vue/test-utils';
import { defineComponent } from 'vue';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { PreferenceSettings } from '~/api/types/preferences';
import type { DirectorySettings, DirectorySnapshot, StorageDirectoryApi } from '~/api/types/storage-directories';

const bridge = vi.hoisted(() => ({
  getDirectories: vi.fn<StorageDirectoryApi['getDirectories']>(),
  chooseDirectory: vi.fn<StorageDirectoryApi['chooseDirectory']>(),
  selectDirectory: vi.fn<StorageDirectoryApi['selectDirectory']>(),
  onPreferencesChanged: vi.fn<(listener: (preferences: PreferenceSettings) => void) => () => void>(),
}));
vi.mock('~/api/capture', () => ({ capture: bridge }));
import { useStorageDirectories } from './useStorageDirectories';
enableAutoUnmount(afterEach);
const initial: DirectorySnapshot = {
  projects: { directory: null, recent: [] },
  exports: { directory: null, lastDirectory: null, recent: [] },
  defaultProjectsDirectory: '/default',
  defaultExportDirectory: '/videos',
};
const preferences = (directories?: DirectorySettings): PreferenceSettings => ({
  schemaVersion: 3,
  theme: 'system',
  recordingBar: { visibility: 'always' },
  recordingInteractions: { enabled: false, noticeDismissed: false },
  devices: {},
  shortcuts: {},
  backgroundPresets: { colors: [], gradients: [] },
  extras: {},
  ...(directories ? { directories } : {}),
});
const listeners = new Set<(preferences: PreferenceSettings) => void>();
const notify = (directories?: DirectorySettings) => listeners.forEach((listener) => listener(preferences(directories)));
const deferred = <T>() => {
  let resolve!: (value: T) => void, reject!: (reason: unknown) => void;
  const promise = new Promise<T>((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
};
const create = () => {
  let state!: ReturnType<typeof useStorageDirectories>;
  const wrapper = mount(
    defineComponent({
      setup() {
        state = useStorageDirectories();
        return () => null;
      },
    }),
  );
  return { state, wrapper };
};
beforeEach(() => {
  listeners.clear();
  vi.clearAllMocks();
  bridge.getDirectories.mockReset().mockResolvedValue(structuredClone(initial));
  bridge.chooseDirectory.mockReset().mockResolvedValue(null);
  bridge.selectDirectory.mockReset().mockResolvedValue(structuredClone(initial));
  bridge.onPreferencesChanged.mockImplementation((listener) => {
    listeners.add(listener);
    return () => listeners.delete(listener);
  });
});
describe('storage directory preferences', () => {
  it('loads real defaults, disables changes while loading and unsubscribes on disposal', async () => {
    const pending = deferred<DirectorySnapshot>();
    bridge.getDirectories.mockReturnValue(pending.promise);
    const { state, wrapper } = create();
    expect(state.busy.value).toBe(true);
    expect(state.snapshot.value).toBeNull();
    await state.choose('projects');
    await state.select('exports', '/videos');
    expect(bridge.chooseDirectory).not.toHaveBeenCalled();
    expect(bridge.selectDirectory).not.toHaveBeenCalled();
    pending.resolve(initial);
    await flushPromises();
    expect(state.snapshot.value).toEqual(initial);
    expect(state.busy.value).toBe(false);
    expect(listeners.size).toBe(1);
    wrapper.unmount();
    expect(listeners.size).toBe(0);
    await state.load();
    await state.choose('exports');
    expect(bridge.getDirectories).toHaveBeenCalledOnce();
  });
  it('reports unavailable metadata, blocks modifications and supports retry', async () => {
    bridge.getDirectories.mockRejectedValueOnce(new Error('Unavailable'));
    const { state } = create();
    await flushPromises();
    expect(state.error.value).toContain('Unavailable');
    expect(state.busy.value).toBe(false);
    await state.choose('exports');
    expect(bridge.chooseDirectory).not.toHaveBeenCalled();
    await state.load();
    expect(state.error.value).toBe('');
    expect(state.snapshot.value).toEqual(initial);
  });
  it('chooses a root using the native picker and leaves the snapshot intact on cancellation', async () => {
    const { state } = create();
    await flushPromises();
    await state.choose('projects');
    expect(state.snapshot.value).toEqual(initial);
    const next = { ...initial, projects: { directory: '/chosen', recent: ['/chosen'] } };
    bridge.chooseDirectory.mockResolvedValue(next);
    await state.choose('projects');
    expect(bridge.chooseDirectory).toHaveBeenLastCalledWith('projects');
    expect(state.snapshot.value).toEqual(next);
  });
  it('selects a remembered destination or automatic mode without a native dialog', async () => {
    const { state } = create();
    await flushPromises();
    const next = {
      ...initial,
      exports: { directory: '/chosen', lastDirectory: '/last', recent: ['/chosen', '/last'] },
    };
    bridge.selectDirectory.mockResolvedValueOnce(next);
    await state.select('exports', '/chosen');
    expect(bridge.selectDirectory).toHaveBeenLastCalledWith({ kind: 'exports', directory: '/chosen' });
    expect(state.snapshot.value).toEqual(next);
    await state.select('exports', null);
    expect(bridge.selectDirectory).toHaveBeenLastCalledWith({ kind: 'exports', directory: null });
    expect(state.snapshot.value).toEqual(initial);
  });
  it('serializes saves, ignores extra changes and load requests, and preserves the current destination on failure', async () => {
    const { state } = create();
    await flushPromises();
    const pending = deferred<DirectorySnapshot | null>();
    bridge.chooseDirectory.mockReturnValue(pending.promise);
    const change = state.choose('projects');
    expect(state.busy.value).toBe(true);
    await state.select('exports', null);
    await state.load();
    expect(bridge.selectDirectory).not.toHaveBeenCalled();
    expect(bridge.getDirectories).toHaveBeenCalledOnce();
    pending.reject(new Error('Permission denied'));
    await change;
    expect(state.busy.value).toBe(false);
    expect(state.snapshot.value).toEqual(initial);
    expect(state.error.value).toContain('Permission denied');
    bridge.selectDirectory.mockRejectedValueOnce('Saving failed');
    await state.select('exports', null);
    expect(state.error.value).toBe('Saving failed');
  });
  it('applies cross-window changes and ignores unrelated preference events', async () => {
    const { state } = create();
    await flushPromises();
    notify();
    expect(state.snapshot.value).toEqual(initial);
    const next = { projects: { directory: '/external', recent: ['/external'] }, exports: initial.exports };
    notify(next);
    expect(state.snapshot.value).toEqual({ ...initial, ...next });
    bridge.chooseDirectory.mockResolvedValue(initial);
    await state.choose('exports');
    expect(state.snapshot.value).toEqual(initial);
  });
  it('keeps newer preference broadcasts received before an older metadata request completes', async () => {
    const pending = deferred<DirectorySnapshot>();
    bridge.getDirectories.mockReturnValue(pending.promise);
    const { state } = create();
    const next = { ...initial, projects: { directory: '/external', recent: ['/external'] } };
    notify(next);
    pending.resolve(initial);
    await flushPromises();
    expect(state.snapshot.value).toEqual(next);
  });
  it('keeps the newest concurrent settings instead of overwriting them with an older save response', async () => {
    const { state } = create();
    await flushPromises();
    const pending = deferred<DirectorySnapshot>();
    bridge.selectDirectory.mockReturnValue(pending.promise);
    const change = state.select('projects', '/first');
    const next = { ...initial, projects: { directory: '/newest', recent: ['/newest', '/first'] } };
    notify(next);
    pending.resolve(initial);
    await change;
    expect(state.snapshot.value).toEqual(next);
  });
  it.each(['resolve', 'reject'] as const)('ignores a metadata %s after unmount', async (outcome) => {
    const pending = deferred<DirectorySnapshot>();
    bridge.getDirectories.mockReturnValue(pending.promise);
    const { state, wrapper } = create();
    wrapper.unmount();
    if (outcome === 'resolve') pending.resolve(initial);
    else pending.reject('Unavailable');
    await flushPromises();
    expect(state.snapshot.value).toBeNull();
    expect(state.error.value).toBe('');
  });
  it.each(['resolve', 'reject'] as const)('ignores a save %s after unmount', async (outcome) => {
    const { state, wrapper } = create();
    await flushPromises();
    const pending = deferred<DirectorySnapshot>();
    bridge.selectDirectory.mockReturnValue(pending.promise);
    const change = state.select('projects', '/chosen');
    wrapper.unmount();
    if (outcome === 'resolve') pending.resolve({ ...initial, projects: { directory: '/chosen', recent: ['/chosen'] } });
    else pending.reject('Denied');
    await change;
    expect(state.snapshot.value).toEqual(initial);
    expect(state.error.value).toBe('');
  });
});
