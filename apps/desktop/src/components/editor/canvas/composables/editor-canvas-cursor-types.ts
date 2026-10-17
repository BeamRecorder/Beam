import type { VisualClip } from '@beam/engine/shared/composition-types';
import type { createCursorMotionPlayer, CursorMotionSample } from '@beam/engine/cursor/cursor-motion';

export interface PreparedCursorMotion {
  player: ReturnType<typeof createCursorMotionPlayer>;
  motion: CursorMotionSample | null;
}
export interface EditorCanvasCursorOptions {
  deviceScale: () => number;
  screenClip: () => VisualClip | null;
  hasScreenFrame: () => boolean;
  renderOnce: () => void;
}
