/** Original recording time, independent of timeline cuts, speed and camera zoom. */
export interface CursorHoverRange {
  startSeconds: number;
  endSeconds: number;
}

export interface CursorHoverSync {
  version: 1;
  ranges: CursorHoverRange[];
}

/** Original immutable screen segments, supplied by the host for preview/export analysis. */
export interface CursorHoverSource {
  id: string;
  src: string;
  startSeconds: number;
  durationSeconds: number;
}
