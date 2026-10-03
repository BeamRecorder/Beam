import type { gsap } from 'gsap';

export interface BeamComposition {
  ready: Promise<unknown>;
  seek(timeMs: number): void;
}

declare global {
  interface Window {
    beamComposition: BeamComposition;
    aiNativeTimeline: gsap.core.Timeline;
  }
}
