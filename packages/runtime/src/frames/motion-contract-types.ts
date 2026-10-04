/** Implement seek using a paused GSAP timeline, Vue state + nextTick, or another deterministic renderer. */
export interface MotionComposition {
  ready?: Promise<void>;
  seek(timeMs: number): void | Promise<void>;
}
