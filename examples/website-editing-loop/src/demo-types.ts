import type {
  TimelineCanvasArtwork,
  TimelineCanvasItem,
} from "@beam/runtime/timeline/timeline-canvas-types";
import type { createMotion } from "./motion";

export interface DemoPose {
  trim: number;
  move: number;
  cursorX: number;
  cursorY: number;
  cursorScale: number;
  trimActive: number;
  moveActive: number;
  snapOpacity: number;
  camera: number;
}
export type DemoCursorRole = "default" | "resizewesteast";
export interface DemoLane {
  id: "titles" | "screen" | "zoom" | "audio";
  title: string;
  items: TimelineCanvasItem[];
}
export interface DemoScene {
  paint(): void;
}
export interface DemoWindow extends Window {
  __timelines: Record<string, ReturnType<typeof createMotion>>;
  beamComposition: {
    ready: Promise<void>;
    timeline: ReturnType<typeof createMotion>;
    seek(timeMs: number): Promise<void>;
  };
}
export type DemoArtworks = Map<string, TimelineCanvasArtwork>;
