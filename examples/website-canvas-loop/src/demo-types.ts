import type { gsap } from 'gsap';
import type { BackgroundKind } from '../../../packages/engine/src/shared/background-types';

export interface CanvasPose {
  time: number;
  x: number;
  y: number;
  camera: number;
}
export interface BackgroundSelection {
  id: string;
  kind: BackgroundKind;
  title: string;
  at: number;
}
export interface BackgroundStep extends BackgroundSelection {
  x: number;
  y: number;
  select?: boolean;
}
export interface CanvasScene {
  ready: Promise<void>;
  paint(): Promise<void>;
}
export interface CanvasWindow extends Window {
  __timelines?: Record<string, gsap.core.Timeline>;
  beamComposition: {
    ready: Promise<void>;
    timeline: gsap.core.Timeline;
    seek(timeMs: number): Promise<void>;
  };
}
