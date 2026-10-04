import { defineComponent } from 'vue';
import { flushPromises, mount } from '@vue/test-utils';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useBackgroundDeletion } from './useBackgroundDeletion';
import type { BackgroundValue } from '@beam/engine/shared/background-types';
import type { PreferenceSettings } from '../../../../api/types/capture-api';

const { capture } = vi.hoisted(() => ({
  capture: { getPreferences: vi.fn(), onPreferencesChanged: vi.fn(), updateBackgroundCatalog: vi.fn() },
}));
vi.mock('../../../../api/capture', () => ({ capture }));
const preferences = (extras: Record<string, unknown> = {}) => ({ extras }) as PreferenceSettings;
const image: BackgroundValue = {
  kind: 'image',
  id: 'user-wallpaper:image:import.png',
  name: 'Imported image',
  extension: 'png',
  path: 'project-media://background/image/import.png',
};
const wrappers: Array<{ unmount: () => void }> = [];
const harness = () => {
  let api!: ReturnType<typeof useBackgroundDeletion>;
  const wrapper = mount(
    defineComponent({
      setup() {
        api = useBackgroundDeletion();
        return () => null;
      },
    }),
  );
  wrappers.push(wrapper);
  return { api, wrapper };
};
beforeEach(() => {
  vi.clearAllMocks();
  capture.getPreferences.mockResolvedValue(preferences());
  capture.onPreferencesChanged.mockReturnValue(vi.fn());
  capture.updateBackgroundCatalog.mockResolvedValue(preferences());
});
afterEach(() => wrappers.splice(0).forEach((wrapper) => wrapper.unmount()));

describe('background catalogue deletion', () => {
  it('protects builtin media, freezes the confirmation item and cancels without writing', async () => {
    const { api } = harness();
    await flushPromises();
    api.request({ ...image, id: 'builtin:image' });
    expect(api.target.value).toBeNull();
    expect(api.canDelete({ kind: 'color', id: 'color:#ffffff', name: 'White', color: '#ffffff' })).toBe(true);
    expect(
      api.canDelete({
        kind: 'gradient',
        id: 'gradient:custom:0',
        name: 'Gradient',
        gradient: { type: 'linear', angle: 0, stops: [] },
      }),
    ).toBe(true);
    api.request(image);
    expect(api.target.value).toEqual(image);
    expect(api.target.value).not.toBe(image);
    api.cancel();
    expect(api.target.value).toBeNull();
    await api.confirm();
    await api.undo();
    await api.redo();
    expect(capture.updateBackgroundCatalog).not.toHaveBeenCalled();
  });
  it('loads hidden identities and undo/redo receipts, ignoring malformed preferences', async () => {
    capture.getPreferences.mockResolvedValue(
      preferences({
        hiddenBackgroundIds: [image.id, null],
        backgroundCatalogHistory: { version: 1, id: image.id, deleted: true },
      }),
    );
    const { api } = harness();
    await flushPromises();
    expect(api.isHidden(image.id)).toBe(true);
    expect(api.canUndo.value).toBe(true);
    expect(api.canRedo.value).toBe(false);
    api.request(image);
    expect(api.target.value).toBeNull();
    const notify = capture.onPreferencesChanged.mock.calls[0]![0];
    for (const receipt of [
      undefined,
      { version: 2 },
      { version: 1, id: 4 },
      { version: 1, id: image.id, deleted: 'yes' },
    ]) {
      notify(preferences({ hiddenBackgroundIds: 'bad', backgroundCatalogHistory: receipt }));
      expect(api.hasHistory.value).toBe(false);
      expect(api.isHidden(image.id)).toBe(false);
    }
  });
  it('removes only the confirmed identity and supports a persisted one-item undo and redo', async () => {
    const deleted = preferences({
      hiddenBackgroundIds: [image.id],
      backgroundCatalogHistory: { version: 1, id: image.id, deleted: true },
    });
    const restored = preferences({
      hiddenBackgroundIds: [],
      backgroundCatalogHistory: { version: 1, id: image.id, deleted: false },
    });
    capture.updateBackgroundCatalog
      .mockResolvedValueOnce(deleted)
      .mockResolvedValueOnce(restored)
      .mockResolvedValueOnce(deleted);
    const { api } = harness();
    await flushPromises();
    api.request(image);
    await api.confirm();
    expect(api.target.value).toBeNull();
    expect(api.isHidden(image.id)).toBe(true);
    await api.undo();
    expect(api.canRedo.value).toBe(true);
    expect(api.canUndo.value).toBe(false);
    await api.redo();
    expect(api.isHidden(image.id)).toBe(true);
    expect(capture.updateBackgroundCatalog.mock.calls.map(([request]) => request)).toEqual([
      { operation: 'remove', id: image.id },
      { operation: 'undo', id: image.id },
      { operation: 'redo', id: image.id },
    ]);
  });
  it('holds the preview while saving and blocks duplicate writes or dismissal', async () => {
    let resolve!: (value: PreferenceSettings) => void;
    capture.updateBackgroundCatalog.mockImplementation(
      () =>
        new Promise((done) => {
          resolve = done;
        }),
    );
    const { api } = harness();
    await flushPromises();
    api.request(image);
    const pending = api.confirm();
    api.cancel();
    api.request({ ...image, id: 'user-wallpaper:video:other.mp4' });
    await api.confirm();
    expect(api.busy.value).toBe(true);
    expect(api.target.value?.id).toBe(image.id);
    expect(capture.updateBackgroundCatalog).toHaveBeenCalledOnce();
    resolve(preferences());
    await pending;
    expect(api.busy.value).toBe(false);
  });
  it('keeps failed confirmation open for retry and exposes failed history updates', async () => {
    capture.updateBackgroundCatalog.mockRejectedValueOnce(new Error('write failed'));
    const { api } = harness();
    await flushPromises();
    api.request(image);
    await api.confirm();
    expect(api.target.value?.id).toBe(image.id);
    expect(api.error.value).toContain('Could not');
    expect(api.busy.value).toBe(false);
    api.cancel();
    expect(api.error.value).toBe('');
    capture.onPreferencesChanged.mock.calls[0]![0](
      preferences({ backgroundCatalogHistory: { version: 1, id: image.id, deleted: true } }),
    );
    capture.updateBackgroundCatalog.mockRejectedValueOnce(new Error('stale receipt'));
    await api.undo();
    expect(api.error.value).toContain('Could not');
  });
  it('reports hydration failures and ignores an outdated initial read after another window changes preferences', async () => {
    capture.getPreferences.mockRejectedValueOnce(new Error('read failed'));
    const failed = harness();
    await flushPromises();
    expect(failed.api.error.value).toContain('Could not load');
    let resolve!: (value: PreferenceSettings) => void;
    capture.getPreferences.mockImplementationOnce(
      () =>
        new Promise((done) => {
          resolve = done;
        }),
    );
    const { api } = harness();
    capture.onPreferencesChanged.mock.calls.at(-1)![0](preferences({ hiddenBackgroundIds: [image.id] }));
    resolve(preferences());
    await flushPromises();
    expect(api.isHidden(image.id)).toBe(true);
  });
  it.each(['read', 'remove', 'failed-read', 'failed-remove'] as const)(
    'disposes subscriptions and ignores late %s results',
    async (operation) => {
      let finish!: (value: PreferenceSettings) => void;
      let fail!: (error: Error) => void;
      const pending = new Promise<PreferenceSettings>((resolve, reject) => {
        finish = resolve;
        fail = reject;
      });
      const unsubscribe = vi.fn();
      capture.onPreferencesChanged.mockReturnValue(unsubscribe);
      if (operation.includes('read')) capture.getPreferences.mockReturnValue(pending);
      else capture.updateBackgroundCatalog.mockReturnValue(pending);
      const { api, wrapper } = harness();
      let writing: Promise<void> | undefined;
      if (operation.includes('remove')) {
        await flushPromises();
        api.request(image);
        writing = api.confirm();
      }
      wrapper.unmount();
      if (operation.startsWith('failed')) fail(new Error('disposed'));
      else finish(preferences({ hiddenBackgroundIds: [image.id] }));
      await writing;
      await flushPromises();
      expect(unsubscribe).toHaveBeenCalledOnce();
      expect(api.isHidden(image.id)).toBe(false);
      expect(api.error.value).toBe('');
    },
  );
});
