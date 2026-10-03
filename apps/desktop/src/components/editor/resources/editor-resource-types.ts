import type { BackgroundMedia } from '@beam/engine/shared/background-types';
import type { CursorPackDescriptor } from '@beam/engine/capture/cursor-pack';
import type { PresetKind } from '@beam/engine/capture/capture-mode';
import type { DesktopCaptureApi } from '~/api/types/capture-api';
import type { EditorPresetDocument } from '~/api/types/editor-preset';

export interface CachedEditorResource<T> {
  get(): Promise<T>;
  invalidate(): void;
  replace(value: T): void;
  dispose(): void;
}
export type EditorResourceHost = Pick<
  DesktopCaptureApi,
  | 'listBackgroundLibrary'
  | 'listCursorPacks'
  | 'getEditorPresets'
  | 'onBackgroundLibraryChanged'
  | 'onCursorPacksChanged'
  | 'onEditorPresetsChanged'
>;
export interface EditorResources {
  backgrounds(): Promise<BackgroundMedia[]>;
  cursors(): Promise<CursorPackDescriptor[]>;
  presets(kind: PresetKind): Promise<EditorPresetDocument>;
  rememberPresets(kind: PresetKind, document: EditorPresetDocument): void;
  onBackgroundsChanged(listener: () => void): () => void;
  onCursorsChanged(listener: () => void): () => void;
  onPresetsChanged(kind: PresetKind, listener: (document: EditorPresetDocument) => void): () => void;
  dispose(): void;
}
