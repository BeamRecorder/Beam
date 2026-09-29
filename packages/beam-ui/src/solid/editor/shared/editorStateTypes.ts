export interface EditorOperationOptions {
  blocking?: boolean;
  selectInserted?: boolean;
  reportStartup?: boolean;
}

export type TimelineShortcut = 'undo'|'redo'|'selectAll'|'copy'|'paste'|'play'|'remove'|'cancel';
