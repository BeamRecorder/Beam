import type { CompositionSnapshot } from '@beam/engine/shared/render-document-types';

export type InspectorMode = 'canvas' | 'clip' | 'shape' | 'blur';
export interface FilmPose {
  time: number;
}
export interface FrameRect {
  x: number;
  y: number;
  width: number;
  height: number;
}
export interface PaintHandle {
  ready: Promise<void>;
  paint(): Promise<void>;
}
export interface FilmHost extends Window {
  beamComposition: { ready: Promise<void>; seek(timeMs: number): Promise<void> };
  filmSnapshot: (time: number) => CompositionSnapshot;
}
export interface CursorWaypoint {
  time: number;
  target: string;
  x?: number;
  y?: number;
  pressed?: boolean;
}
