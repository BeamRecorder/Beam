import type { gsap } from "gsap";
import type { ClipComposition } from "@beam/engine/shared/composition-types";
import type { CompositionSnapshot } from "@beam/engine/shared/render-document-types";
export type DemoTheme = "light" | "dark";
export type InspectorMode = "clip" | "caption" | "shadow" | "size" | "canvas";
export type Stage =
  "initial" | "trimmed" | "split" | "split-again" | "deleted" | "cut";
export interface Pose {
  time: number;
}
export interface Point {
  x: number;
  y: number;
}
export interface PointerStop extends Point {
  at: number;
}
export interface SceneHandle {
  ready: Promise<void>;
  paint(): Promise<void>;
}
export interface TimelineHandle {
  ready: Promise<void>;
  paint(): void;
}
export interface StudioState {
  composition: ClipComposition;
  mode: InspectorMode;
  previewTime: number;
  playing: boolean;
}
export interface DemoWindow extends Window {
  __timelines: Record<string, gsap.core.Timeline>;
  beamComposition: {
    ready: Promise<void>;
    timeline: gsap.core.Timeline;
    seek(ms: number): Promise<void>;
  };
  studioDocument: {
    composition: ClipComposition;
    snapshot: CompositionSnapshot;
  };
}
export interface HyperframesSeekDetail {
  time: number;
  waitUntil(pending: Promise<void>): void;
}
