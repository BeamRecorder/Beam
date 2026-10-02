export interface CanvasMarqueeTarget {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
  rotation?: number;
  backdrop?: boolean;
}

export interface CanvasMarqueeSelection {
  ids: string[];
  primaryId: string | null;
  additive: boolean;
}

export interface CanvasMarqueeBounds {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface CanvasMarqueeGesture {
  pointerId: number;
  origin: { x: number; y: number };
  clientOrigin: { x: number; y: number };
  target: Element;
  initial: string[];
  last: string[];
  targets: CanvasMarqueeTarget[];
  additive: boolean;
  dragged: boolean;
}
