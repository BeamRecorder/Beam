import type { ResizeCorner } from '~/ui/ResizeHandle/types';
import type { CanvasRect } from './layer-transform-geometry';
import type { ClipComposition, NormalizedCrop, NormalizedTransform } from '~/media/shared/composition-types';
import type { CaptionTextMeasurer } from '~/media/shared/caption-text-layout';
import type { TransformClip } from '../editor-canvas-types';
import type { OutputCanvasSettings } from '../output-canvas';
import type { VideoWindowBounds } from './useCameraZoom';

export interface UseLayerTransformAndCropOptions {
  composition: () => ClipComposition;
  currentTime: () => number;
  selectedTransformClip: () => TransformClip | null;
  videoWindowBounds: () => VideoWindowBounds | null;
  overlayWindowBounds: () => VideoWindowBounds | null;
  isCropping: () => boolean | undefined;
  outputCanvas: () => OutputCanvasSettings;
  measureCaptionText?: CaptionTextMeasurer;
  zoomScale?: () => number;
  onUpdateTransform: (transform: NormalizedTransform) => void;
  onPreviewCrop?: (crop: NormalizedCrop | null) => void;
  onUpdateCrop: (crop: NormalizedCrop) => void;
  onSelectTransformClip: (clipId: string) => void;
}

export interface CropDrag {
  kind: 'move' | 'resize';
  corner?: ResizeCorner;
  startX: number;
  startY: number;
  value: NormalizedCrop;
}
export type CropDisplayLayout = (clip: TransformClip) => CanvasRect | null;
