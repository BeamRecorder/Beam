import type { CanvasMarqueeTarget } from '../editor/canvas/canvas-marquee-types';

export interface ScreenshotMarqueeSurfaceProps {
  canvas: HTMLCanvasElement | null;
  viewport: { width: number; height: number };
  targets: () => readonly CanvasMarqueeTarget[];
  selection: string[];
  disabled: boolean;
  layerAt: (event: MouseEvent) => string | null;
  spacePressed: boolean;
}
