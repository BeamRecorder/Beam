import type { EditorInsertKind } from '../editor/search/editor-search-types';
export interface ScreenshotInsertOptions {
  canInsert: () => boolean;
  selectClip: () => void;
  shape: (kind: 'shape' | 'arrow' | 'text' | 'drawing') => void;
  image: () => Promise<void>;
  cursor: () => void;
  effect: (kind: 'blur' | 'highlight') => void;
}
export type ScreenshotInserter = (kind: EditorInsertKind) => Promise<void>;
