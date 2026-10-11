import type { gsap } from 'gsap';
export interface ScenePose {
  clock: number;
}
export interface SceneWindow extends Window {
  __timelines: Record<string, gsap.core.Timeline>;
  beamComposition: { ready: Promise<void>; timeline: gsap.core.Timeline; seek(timeMs: number): Promise<void> };
}
