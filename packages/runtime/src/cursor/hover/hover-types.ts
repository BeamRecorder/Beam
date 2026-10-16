import type { CursorHoverSync } from '@beam/engine/cursor/cursor-hover-types';

export type HoverSource = import('@beam/engine/cursor/cursor-hover-types').CursorHoverSource;

export interface HoverPoint {
  time: number;
  x: number;
  y: number;
  active: boolean;
}

export interface HoverDifference {
  width: number;
  height: number;
  /** RGBA8 tile coverage. Row zero corresponds to the top of the original image. */
  pixels: Uint8Array;
}

export interface HoverAnalysisInput {
  sources: HoverSource[];
  /** Interleaved time seconds, normalized x/y, visible and not dragging (0/1). */
  path: Float64Array;
}

export type HoverWorkerReply =
  | { type: 'progress' }
  | { type: 'complete'; sync: CursorHoverSync }
  | { type: 'error'; message: string };
