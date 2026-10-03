import type { ZoomElement } from '@beam/engine/zoom/zoom-types';

export interface ZoomFocusControlProps {
  zoom: ZoomElement;
  canvasSize?: { width: number; height: number };
}
export interface GlassHighlightControlProps extends ZoomFocusControlProps {
  still?: boolean;
}
