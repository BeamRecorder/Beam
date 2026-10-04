import { expect, it, vi } from 'vitest';
import { createEditorResources } from './editor-resources';
import type { EditorResourceHost } from './editor-resource-types';
import type { EditorPresetDocument } from '~/api/types/editor-preset';
import type { PresetKind } from '@beam/engine/capture/capture-mode';

const setup = () => {
  let backgroundChanged!: () => void, cursorChanged!: () => void;
  const changed = new Map<PresetKind, (document: EditorPresetDocument) => void>();
  const stop = vi.fn();
  const host = {
    listBackgroundLibrary: vi.fn(async () => []),
    listCursorPacks: vi.fn(async () => []),
    getEditorPresets: vi.fn(async () => ({ schemaVersion: 1 as const, activePresetId: 'default', presets: [] })),
    onBackgroundLibraryChanged: vi.fn((listener) => {
      backgroundChanged = listener;
      return stop;
    }),
    onCursorPacksChanged: vi.fn((listener) => {
      cursorChanged = listener;
      return stop;
    }),
    onEditorPresetsChanged: vi.fn((listener, kind = 'video') => {
      changed.set(kind, listener);
      return stop;
    }),
  } satisfies EditorResourceHost;
  const resources = createEditorResources(host);
  return {
    resources,
    host,
    stop,
    changed,
    backgroundChanged: () => backgroundChanged(),
    cursorChanged: () => cursorChanged(),
  };
};
it('shares repeated Screenshot/Video library requests with one native subscription per library', async () => {
  const { resources, host } = setup();
  expect(host.onBackgroundLibraryChanged).not.toHaveBeenCalled();
  await Promise.all([resources.backgrounds(), resources.backgrounds(), resources.cursors(), resources.cursors()]);
  await resources.backgrounds();
  await resources.cursors();
  expect(host.listBackgroundLibrary).toHaveBeenCalledOnce();
  expect(host.listCursorPacks).toHaveBeenCalledOnce();
  expect(host.onBackgroundLibraryChanged).toHaveBeenCalledOnce();
  expect(host.onCursorPacksChanged).toHaveBeenCalledOnce();
  resources.dispose();
});
it('keeps Video/Screenshot presets separate and updates them from changed-event payloads', async () => {
  const { resources, host, changed } = setup();
  const video = await resources.presets('video'),
    screenshot = await resources.presets('screenshot');
  expect(host.getEditorPresets).toHaveBeenCalledTimes(2);
  expect(host.getEditorPresets).toHaveBeenCalledWith('video');
  expect(host.getEditorPresets).toHaveBeenCalledWith('screenshot');
  const listener = vi.fn((document: EditorPresetDocument) => {
    document.activePresetId = 'draft';
  });
  const stop = resources.onPresetsChanged('screenshot', listener);
  changed.get('screenshot')!({ ...screenshot, activePresetId: 'updated' });
  expect((await resources.presets('screenshot')).activePresetId).toBe('updated');
  expect(await resources.presets('video')).toEqual(video);
  expect(host.getEditorPresets).toHaveBeenCalledTimes(2);
  stop();
  changed.get('screenshot')!(screenshot);
  expect(listener).toHaveBeenCalledOnce();
  resources.dispose();
});
it('invalidates external library changes even while their editor is unmounted', async () => {
  const { resources, host, backgroundChanged, cursorChanged } = setup();
  await resources.backgrounds();
  await resources.cursors();
  const background = vi.fn(),
    cursor = vi.fn();
  const stopBackground = resources.onBackgroundsChanged(background),
    stopCursor = resources.onCursorsChanged(cursor);
  backgroundChanged();
  cursorChanged();
  expect(background).toHaveBeenCalledOnce();
  expect(cursor).toHaveBeenCalledOnce();
  await resources.backgrounds();
  await resources.cursors();
  stopBackground();
  stopCursor();
  backgroundChanged();
  cursorChanged();
  await resources.backgrounds();
  await resources.cursors();
  expect(background).toHaveBeenCalledOnce();
  expect(cursor).toHaveBeenCalledOnce();
  expect(host.listBackgroundLibrary).toHaveBeenCalledTimes(3);
  expect(host.listCursorPacks).toHaveBeenCalledTimes(3);
  resources.dispose();
});
it('remembers a preset write even before its native changed event arrives', async () => {
  const { resources, host } = setup();
  resources.rememberPresets('video', { schemaVersion: 1, activePresetId: 'saved', presets: [] });
  expect((await resources.presets('video')).activePresetId).toBe('saved');
  expect(host.getEditorPresets).not.toHaveBeenCalled();
  resources.dispose();
});
it('releases each native subscription once and rejects all late activity', async () => {
  const { resources, changed, backgroundChanged, cursorChanged, stop } = setup();
  const callback = vi.fn();
  resources.onBackgroundsChanged(callback);
  resources.onCursorsChanged(callback);
  resources.onPresetsChanged('screenshot', callback);
  resources.onPresetsChanged('video', callback);
  resources.dispose();
  resources.dispose();
  expect(stop).toHaveBeenCalledTimes(4);
  backgroundChanged();
  cursorChanged();
  changed.forEach((listener) => listener({ schemaVersion: 1, activePresetId: 'late', presets: [] }));
  expect(callback).not.toHaveBeenCalled();
  expect(() => resources.backgrounds()).toThrow('disposed');
  expect(() => resources.cursors()).toThrow('disposed');
  expect(() => resources.presets('video')).toThrow('disposed');
});
