import type { NormalizedTransform } from '@beam/engine/shared/composition-types';
import type { Canvas2DContext } from '@beam/runtime/canvas-types';
import type { EditorCanvasProps } from './editor-canvas-types';
import type { ZoomElement } from '@beam/engine/zoom/zoom-types';
export interface RuntimePreviewOptions {
  props: EditorCanvasProps;
  images: ReadonlyMap<string, HTMLImageElement>;
  cursorImage(): HTMLImageElement | null;
  watermarkImage(): HTMLImageElement | null;
  cursorEnabled(): boolean;
  drafts(): Readonly<Record<string, NormalizedTransform>>;
  zoomDraft?(): ZoomElement | null;
  editingCaptionId(): string | null;
  /** Stable pixel inputs; null keeps video and background transitions live. */
  backgroundCacheKey(): readonly unknown[] | null;
  drawBackground(context: Canvas2DContext, bounds: { x: number; y: number; width: number; height: number }): void;
}
