import type { gsap } from 'gsap';
export interface ScenePose {
  clock: number;
}
export interface RenderState {
  typed: string;
  caret: boolean;
  progress: number;
  percentage: number;
  phase: 'idle' | 'rendering' | 'finalizing' | 'saved';
  frame: number;
}
export interface SceneWindow extends Window {
  __timelines: Record<string, gsap.core.Timeline>;
  beamComposition: { ready: Promise<void>; timeline: gsap.core.Timeline; seek(timeMs: number): Promise<void> };
}
