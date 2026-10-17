import type { NormalizedTransform } from '@beam/engine/shared/composition-types';
import type { Canvas2DContext } from '@beam/runtime/canvas-types';
import type { EditorCanvasProps } from './editor-canvas-types';
import type { ZoomElement } from '@beam/engine/zoom/zoom-types';
import type { CompositionSnapshot } from '@beam/engine/shared/render-document-types';
import type { CompositionSceneLayers } from '@beam/engine/composition/scene-layers';
import type { CompositionCameraEvaluator } from '@beam/engine/zoom/composition-camera-types';
import type { createCursorMotionPlayer } from '@beam/engine/cursor/cursor-motion';
import type { CompositionFrameEvaluation } from '@beam/runtime/rendering/render-types';
import type { MediaFrame } from '@beam/runtime/shared/index';

/** Borrowed resources are consumed synchronously within one editor render. */
export interface RuntimePreviewFrame {
  bounds: { x: number; y: number; width: number; height: number };
  size: { width: number; height: number };
  frame: MediaFrame | null;
  layers: CompositionSceneLayers;
  snapshot: CompositionSnapshot;
  motion: ReturnType<typeof createCursorMotionPlayer>;
  evaluator: CompositionCameraEvaluator;
  evaluation: CompositionFrameEvaluation;
  time: number;
}
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
