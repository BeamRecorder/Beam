import type { VisualClip } from '~/media/shared/composition-types';
export interface EditorCanvasCursorOptions {
  deviceScale: () => number;
  screenClip: () => VisualClip | null;
  hasScreenFrame: () => boolean;
  renderOnce: () => void;
}
