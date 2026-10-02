import type { NormalizedTransform } from '@beam/engine/shared/composition-types';
import type { Canvas2DContext } from '@beam/runtime/canvas-types';
import type { EditorCanvasProps } from './editor-canvas-types';
export interface RuntimePreviewOptions {
  props: EditorCanvasProps;
  images: ReadonlyMap<string, HTMLImageElement>;
  cursorImage(): HTMLImageElement | null;
  watermarkImage(): HTMLImageElement | null;
  cursorEnabled(): boolean;
  drafts(): Readonly<Record<string, NormalizedTransform>>;
  editingCaptionId(): string | null;
  drawBackground(context: Canvas2DContext, bounds: { x: number; y: number; width: number; height: number }): void;
}
