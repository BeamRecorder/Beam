import type { gsap } from 'gsap';
import type { CaptureProject } from '../../../packages/engine/src/capture/capture-session';
export type DemoKind = 'teleprompter' | 'projects';
export type DemoTheme = 'light' | 'dark';
export interface DemoPose {
  time: number;
  x: number;
  y: number;
  camera: number;
}
export interface DemoWindow extends Window {
  __timelines: Record<string, gsap.core.Timeline>;
  beamComposition: { ready: Promise<void>; timeline: gsap.core.Timeline; seek(timeMs: number): Promise<void> };
}

export interface CatalogProject extends CaptureProject {
  image: string;
}
