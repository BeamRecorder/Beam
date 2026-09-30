import type { CursorStyle } from '../shared/generated/editorContracts';
import type { EditorState } from '../shared/useEditor';

export interface CursorControlsProps {
  editor: EditorState;
  style: CursorStyle;
  onChange: (value: Partial<CursorStyle>) => void;
}
export interface CursorPackSummary {
  id: string;
  name: string;
  cursors: { id: string; label: string; tintable: boolean }[];
}
