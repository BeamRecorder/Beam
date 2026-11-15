import type { VisualClip } from '@beam/engine/shared/composition-types';
import type { ScreenRenderGeometry } from '@beam/engine/composition/camera-layout';
import type { MediaFrame } from '@beam/runtime/shared/index';
import type { OutputCanvasSettings, CanvasRect } from '@beam/engine/layout/output-canvas';
export interface ScreenPreviewPaint {
  screen: VisualClip | null;
  frame: MediaFrame | null;
  source: CanvasRect;
  positioned: CanvasRect;
  output: OutputCanvasSettings;
  preview: CanvasRect;
  editingPhoneCrop: boolean;
  cropFrame: CanvasRect | null;
  geometry: ScreenRenderGeometry | null;
}
