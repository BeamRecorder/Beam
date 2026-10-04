import type { ScreenshotState } from '@beam/engine/screenshot/screenshot-types';
import type { CursorPackDescriptor } from '@beam/engine/capture/cursor-pack';
import type { NormalizedCrop, NormalizedTransform } from '@beam/engine/shared/composition-types';
import type { ScreenshotSelectionMode, ScreenshotTranslation } from './screenshot-types';
import type { CanvasMarqueeSelection } from '../editor/canvas/canvas-marquee-types';
import type { ZoomElement } from '@beam/engine/zoom/zoom-types';

export interface ScreenshotCanvasProps {
  source: string;
  state: ScreenshotState;
  selectedId: string | null;
  selectedIds: string[];
  disabled?: boolean;
  cropping?: boolean;
  cursorPacks?: CursorPackDescriptor[];
  cursorPacksReady?: boolean;
  handlesMuted?: boolean;
  zoomDisabled?: boolean;
}
export interface ScreenshotCanvasEmits {
  select: [id: string | null, mode?: ScreenshotSelectionMode];
  selectMany: [selection: CanvasMarqueeSelection];
  transform: [value: NormalizedTransform];
  translate: [value: ScreenshotTranslation];
  resizeSelection: [from: NormalizedTransform, to: NormalizedTransform];
  selectionBounds: [value: NormalizedTransform | null];
  error: [message: string];
  ready: [];
  crop: [value: NormalizedCrop];
  cropDone: [];
  cropRequest: [id: string];
  rotate: [value: number];
  updateZoom: [zoom: ZoomElement];
}
