import type { Component, ComputedRef, InjectionKey, Ref } from 'vue';
import type { TimelineElementKind } from '../timeline/timeline-element-types';
import type { useClipComposition } from '../composables/useClipComposition';
import type { MediaAsset, ShapeClip, ColorClip } from '~/media/shared/composition-types';
import type { LayerThumbnail } from '../screenshot/composition/thumbnails/thumbnail-types';
import type { CommandPaletteItem } from '~/ui/command-palette/command-palette-types';
import type { ScreenshotState, ScreenshotDocument } from '~/api/types/screenshot';
import type { CursorPackDescriptor } from '~/api/types/cursor-pack';
import type { useProjectZoom } from '../composables/useProjectZoom';

export type EditorSearchGroup = 'insert' | 'navigation' | 'selection' | 'setting' | 'action';
export type EditorInsertKind = TimelineElementKind | 'cursor';
export type EditorSearchPreview =
  | { kind: 'image'; src: string }
  | { kind: 'video'; asset: MediaAsset; timeSec: number }
  | { kind: 'shape'; clip: ShapeClip }
  | { kind: 'color'; clip: ColorClip }
  | { kind: 'layer'; value?: LayerThumbnail };
export interface EditorSearchAction {
  id: string;
  label: string;
  group: EditorSearchGroup;
  icon?: Component;
  detail?: string;
  terms?: string[];
  disabled?: boolean;
  preview?: EditorSearchPreview;
  tab?: string;
  run: () => void | Promise<void>;
}
export interface EditorSearchOptions {
  mode: 'video' | 'screenshot';
  canInsert: () => boolean;
  canEditClip: () => boolean;
  canEditZoom?: () => boolean;
  clipKind: () => string | undefined;
  propertyAvailable?: (group: EditorPropertyGroup, key: string) => boolean;
  visible?: (ids: string[]) => void;
  insert: (kind: EditorInsertKind) => void | Promise<void>;
  selections: () => EditorSearchAction[];
}
export interface EditorSearchContext {
  open: Ref<boolean>;
  actions: ComputedRef<EditorSearchAction[]>;
  items: ComputedRef<CommandPaletteItem[]>;
  ready: Ref<boolean>;
  setVisibleActions: (ids: string[]) => void;
  registerActions: (provider: () => EditorSearchAction[]) => () => void;
  navigate: (tab: string) => Promise<void>;
  setNavigator: (navigate: (tab: string) => void) => () => void;
}
export const editorSearchKey: InjectionKey<EditorSearchContext> = Symbol('editor-search');
export interface EditorPropertyGroup {
  namespace: string;
  tab: string;
  keys: readonly string[];
  videoOnly?: boolean;
  clipOnly?: boolean;
  kinds?: readonly string[];
  section?: 'appearance' | 'text';
  modes?: readonly ('video' | 'screenshot')[];
}
export interface VideoEditorSearchOptions {
  compositionState: ReturnType<typeof useClipComposition>;
  zoomState: ReturnType<typeof useProjectZoom>;
  addEditorElement: (kind: Exclude<TimelineElementKind, 'voiceover'>) => Promise<unknown>;
  canInsert: () => boolean;
}

export interface ScreenshotEditorSearchOptions {
  state: Ref<ScreenshotState | null>;
  document: Ref<ScreenshotDocument | null>;
  packs: () => CursorPackDescriptor[];
  selectedId: Ref<string | null>;
  canInsert: () => boolean;
  insert: (kind: EditorInsertKind) => void | Promise<void>;
  select: (id: string) => void;
}
