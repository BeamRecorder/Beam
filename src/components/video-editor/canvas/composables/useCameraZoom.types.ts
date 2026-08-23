import type { ProjectEditorData } from '~/api/types/capture-api';
import type { ClipComposition, NormalizedTransform } from '~/media/shared/composition-types';
import type { ZoomElement, ZoomMotionBlurSettings } from '../../zoom/zoom-types';
import type { OutputCanvasSettings } from '../output-canvas';
import type { CompositionSceneLayers } from '../../composition/scene-layers';

export interface VideoWindowBounds {
  dx: number;
  dy: number;
  dw: number;
  dh: number;
  scale: number;
  focusX?: number;
  focusY?: number;
}

export interface RenderedVideoWindow extends VideoWindowBounds {
  focusX: number;
  focusY: number;
}

export interface UseCameraZoomOptions {
  canvasRef: () => HTMLCanvasElement | null;
  outputCanvas: () => OutputCanvasSettings;
  zoomElements: () => ZoomElement[];
  zoomMotionBlur?: () => ZoomMotionBlurSettings;
  selectedZoom: () => ZoomElement | null;
  currentTime: () => number;
  isPlaying: () => boolean;
  editorData: () => ProjectEditorData | null | undefined;
  activeTab: () => string;
  composition: () => ClipComposition;
  screenTransformDraft?: () => NormalizedTransform | null;
  isCropping?: () => boolean | undefined;
  drawBackground: (
    ctx: CanvasRenderingContext2D,
    bounds: { x: number; y: number; width: number; height: number },
  ) => void;
  videoError: () => string | null;
  renderVisualStack?: (
    ctx: CanvasRenderingContext2D,
    videoWindow: RenderedVideoWindow,
    drawScreen: () => void,
    layers: CompositionSceneLayers,
  ) => void;
  onUpdateZoom: (zoom: ZoomElement) => void;
  onSelectScreenClip: (clipId: string) => void;
  onSelectCanvas: () => void;
  onDeselectTransformClip: () => void;
  onDeselectZoom: () => void;
  selectVisualAt: (event: PointerEvent) => boolean;
  selectedTransformClipExists: () => boolean;
  onRenderOnce?: () => void;
}
