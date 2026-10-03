import type { GlassPoint } from '@beam/engine/zoom/glass-highlight-types';
import type { ZoomElement } from '@beam/engine/zoom/zoom-types';

export interface GlassSelectionGesture {
  pointerId: number;
  target: Element;
  kind: 'move' | 'resize' | 'draw';
  origin: GlassPoint;
  zoom: ZoomElement;
  points: GlassPoint[];
}

export interface GlassSelectionProps {
  zoom: ZoomElement;
  canvasSize: { width: number; height: number };
  viewportStyle: import('vue').CSSProperties;
  panning: boolean;
}
