import type { gsap } from 'gsap';
export interface ScenePose {
  clock: number;
}
export interface SceneState {
  typed: string;
  title: string;
  saved: boolean;
  accent: string;
  phase: string;
  caret: boolean;
}
export interface SceneWindow extends Window {
  __timelines: Record<string, gsap.core.Timeline>;
  beamComposition: { ready: Promise<void>; timeline: gsap.core.Timeline; seek(timeMs: number): Promise<void> };
}

export interface SceneInstance {
  ready(): Promise<void>;
}
