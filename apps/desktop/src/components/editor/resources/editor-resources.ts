import type { PresetKind } from '@beam/engine/capture/capture-mode';
import type { EditorPresetDocument } from '~/api/types/editor-preset';
import { createCachedEditorResource } from './cached-editor-resource';
import type { EditorResourceHost, EditorResources } from './editor-resource-types';

/** One window retains catalogue metadata, never document state or media decoders. */
export function createEditorResources(host: EditorResourceHost): EditorResources {
  const backgrounds = createCachedEditorResource(() => host.listBackgroundLibrary());
  const cursors = createCachedEditorResource(() => host.listCursorPacks());
  const presets = {
    video: createCachedEditorResource(() => host.getEditorPresets('video')),
    screenshot: createCachedEditorResource(() => host.getEditorPresets('screenshot')),
  };
  const backgroundListeners = new Set<() => void>();
  const cursorListeners = new Set<() => void>();
  const presetListeners = {
    video: new Set<(document: EditorPresetDocument) => void>(),
    screenshot: new Set<(document: EditorPresetDocument) => void>(),
  };
  const subscriptions = new Map<string, () => void>();
  let disposed = false;
  const ensure = (key: string, subscribe: () => () => void) => {
    if (disposed) throw new DOMException('Editor resources disposed.', 'AbortError');
    if (!subscriptions.has(key)) subscriptions.set(key, subscribe());
  };
  const listenBackgrounds = () =>
    ensure('backgrounds', () =>
      host.onBackgroundLibraryChanged(() => {
        if (disposed) return;
        backgrounds.invalidate();
        backgroundListeners.forEach((listener) => listener());
      }),
    );
  const listenCursors = () =>
    ensure('cursors', () =>
      host.onCursorPacksChanged(() => {
        if (disposed) return;
        cursors.invalidate();
        cursorListeners.forEach((listener) => listener());
      }),
    );
  const listenPresets = (kind: PresetKind) =>
    ensure(kind, () =>
      host.onEditorPresetsChanged((document) => {
        if (disposed) return;
        presets[kind].replace(document);
        presetListeners[kind].forEach((listener) =>
          listener(JSON.parse(JSON.stringify(document)) as EditorPresetDocument),
        );
      }, kind),
    );
  return {
    backgrounds() {
      listenBackgrounds();
      return backgrounds.get();
    },
    cursors() {
      listenCursors();
      return cursors.get();
    },
    presets(kind) {
      listenPresets(kind);
      return presets[kind].get();
    },
    rememberPresets(kind, document) {
      presets[kind].replace(document);
    },
    onBackgroundsChanged(listener) {
      listenBackgrounds();
      backgroundListeners.add(listener);
      return () => {
        backgroundListeners.delete(listener);
      };
    },
    onCursorsChanged(listener) {
      listenCursors();
      cursorListeners.add(listener);
      return () => {
        cursorListeners.delete(listener);
      };
    },
    onPresetsChanged(kind, listener) {
      listenPresets(kind);
      presetListeners[kind].add(listener);
      return () => {
        presetListeners[kind].delete(listener);
      };
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      subscriptions.forEach((stop) => stop());
      subscriptions.clear();
      backgroundListeners.clear();
      cursorListeners.clear();
      presetListeners.video.clear();
      presetListeners.screenshot.clear();
      backgrounds.dispose();
      cursors.dispose();
      presets.video.dispose();
      presets.screenshot.dispose();
    },
  };
}
