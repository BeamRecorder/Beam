import type { gsap } from 'gsap';
import type { CursorKind } from '../../../packages/engine/src/capture/capture-session';

export interface CursorPose {
  time: number;
}
export interface DemoClick {
  at: number;
  x: number;
  y: number;
  target: 'action' | 'pack';
}
export interface ShowcaseStep {
  at: number;
  role: CursorKind;
  label: string;
  action: 'button' | 'text' | 'move' | 'resize' | 'select' | 'disabled' | 'help';
}
export interface CursorScene {
  ready: Promise<void>;
}
export interface CursorWindow extends Window {
  __timelines?: Record<string, gsap.core.Timeline>;
  beamComposition: {
    ready: Promise<void>;
    timeline: gsap.core.Timeline;
    seek(timeMs: number): Promise<void>;
  };
}
