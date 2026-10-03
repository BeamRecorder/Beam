export type HistoryOperation =
  | 'add'
  | 'remove'
  | 'edit'
  | 'move'
  | 'resize'
  | 'crop'
  | 'timing'
  | 'visibility'
  | 'reorder'
  | 'rename';

export type HistoryTarget =
  | 'screen'
  | 'video'
  | 'image'
  | 'webcam'
  | 'color'
  | 'shape'
  | 'arrow'
  | 'text'
  | 'drawing'
  | 'blur'
  | 'highlight'
  | 'audio'
  | 'caption'
  | 'keyboardCaption'
  | 'cursor'
  | 'zoom'
  | 'background'
  | 'canvas'
  | 'layers'
  | 'export'
  | 'changes';

export interface HistoryChange {
  operation: HistoryOperation;
  target: HistoryTarget;
  name?: string;
  count?: number;
}

export interface HistoryItem {
  id: string;
  target: HistoryTarget;
  name?: string;
  state: object;
}
