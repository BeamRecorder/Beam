import type { gsap } from 'gsap';

export interface BreathPose {
  time: number;
  x: number;
  y: number;
  camera: number;
}
export interface BreathWindow extends Window {
  __timelines: Record<string, gsap.core.Timeline>;
  beamComposition: {
    ready: Promise<void>;
    timeline: gsap.core.Timeline;
    seek(timeMs: number): Promise<void>;
  };
}
