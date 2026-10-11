import type { gsap } from 'gsap';
export interface ScenePose {
  clock: number;
}
export interface CommandCue {
  label: string;
  command: string;
  start: number;
  end: number;
}
export interface CommandState {
  typed: string;
  caret: boolean;
  complete: boolean;
  visible: boolean;
}
export interface SceneWindow extends Window {
  __timelines: Record<string, gsap.core.Timeline>;
  beamComposition: {
    ready: Promise<void>;
    timeline: gsap.core.Timeline;
    seek(timeMs: number): Promise<void>;
  };
}
