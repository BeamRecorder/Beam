import type { gsap } from "gsap";
export type DemoMode = "presets" | "export" | "clipboard" | "hero";
export interface Pose {
  time: number;
}
export interface CursorPoint {
  at: number;
  x: number;
  y: number;
}
export interface NativeComposition {
  ready: Promise<void>;
  seek(timeMs: number): Promise<void>;
}
export interface DemoWindow extends Window {
  beamNative?: NativeComposition;
  beamComposition: NativeComposition & { timeline: gsap.core.Timeline };
  __timelines: Record<string, gsap.core.Timeline>;
}

export interface SceneController {
  ready: Promise<void>;
  synchronize(): Promise<void>;
}
