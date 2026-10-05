import type { gsap } from 'gsap';

export type DemoMode = 'transitions' | 'export';
export interface Pose {
  time: number;
}
export interface DemoClick {
  at: number;
  x: number;
  y: number;
  target: string;
}
export interface CursorPoint {
  at: number;
  x: number;
  y: number;
}
export interface DemoScene {
  ready: Promise<void>;
  paint(): void;
}
export interface DemoWindow extends Window {
  __timelines: Record<string, gsap.core.Timeline>;
  beamComposition: {
    ready: Promise<void>;
    timeline: gsap.core.Timeline;
    seek(timeMs: number): Promise<void>;
  };
}
