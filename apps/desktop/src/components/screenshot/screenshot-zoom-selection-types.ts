import type { ZoomElement } from '@beam/engine/zoom/zoom-types';
export interface StillZoomSelectionProps {
  zoom: ZoomElement;
  canvasSize: { width: number; height: number };
  size: { width: number; height: number };
  panning: boolean;
}
export interface StillZoomGesture {
  x: number;
  y: number;
  id: number;
  target: Element;
}
