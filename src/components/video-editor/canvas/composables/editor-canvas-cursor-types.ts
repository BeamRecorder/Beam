import type { VisualClip } from '@beam/engine/shared/composition-types';
export interface EditorCanvasCursorOptions {
  deviceScale: () => number;
  screenClip: () => VisualClip | null;
  hasScreenFrame: () => boolean;
  renderOnce: () => void;
}
