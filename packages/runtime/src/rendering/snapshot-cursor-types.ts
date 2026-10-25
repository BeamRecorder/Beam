import type { createCursorMotionPlayer } from '@beam/engine/cursor/cursor-motion';
import type { CompositionSnapshot } from '@beam/engine/shared/render-document-types';
export interface SnapshotCursorMotionCache {
  events: CompositionSnapshot['cursor']['events'];
  hover: CompositionSnapshot['cursor']['hoverSync'];
  players: Map<string, ReturnType<typeof createCursorMotionPlayer>>;
}
