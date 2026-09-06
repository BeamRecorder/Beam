import type { TimelineSelectionIds } from './timeline-tracks-types';

export interface SelectionPoint {
  x: number;
  y: number;
}
export interface SelectionBounds extends SelectionPoint {
  width: number;
  height: number;
}
export interface SelectionTarget extends SelectionBounds {
  id: string;
  kind: 'clip' | 'zoom';
}
export interface BoxSelectionGesture {
  pointerId: number;
  origin: SelectionPoint;
  clientOrigin: SelectionPoint;
  target: Element;
  initial: TimelineSelectionIds;
  last: TimelineSelectionIds;
  targets: SelectionTarget[];
  additive: boolean;
  dragged: boolean;
}
