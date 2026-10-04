export type ResizeCorner =
  | 'top-left'
  | 'top'
  | 'top-right'
  | 'right'
  | 'bottom-right'
  | 'bottom'
  | 'bottom-left'
  | 'left';

export interface ResizeHandlePosition {
  x: number;
  y: number;
}

export type ResizeHandlePositions = Partial<Record<ResizeCorner, ResizeHandlePosition>>;
