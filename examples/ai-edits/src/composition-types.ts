export interface BeamComposition {
  ready: Promise<unknown>;
  seek(timeMs: number): void;
}

declare global {
  interface Window {
    beamComposition: BeamComposition;
    aiNativeTimeline: ReturnType<typeof import('gsap').gsap.timeline>;
  }
}
