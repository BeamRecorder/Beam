import type { CameraSample } from '@beam/engine/zoom/composition-camera-types';
import type { CursorMotionSample } from '@beam/engine/cursor/cursor-motion';

/** Center samples shared by editor hit geometry and the completed-frame painter. */
export interface CompositionFrameEvaluation {
  camera: CameraSample;
  cursorMotion: CursorMotionSample | null;
}

export interface RenderableMedia {
  source: CanvasImageSource;
  width: number;
  height: number;
  preRendered?: boolean;
}
export type CompositionVisuals = ReadonlyMap<string, RenderableMedia>;

export interface MediaRenderCamera {
  scale: number;
  focusX: number;
  focusY: number;
}
