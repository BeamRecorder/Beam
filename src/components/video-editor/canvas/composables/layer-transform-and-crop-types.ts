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
  onUpdateCrop: (crop: NormalizedCrop) => void;
  onSelectTransformClip: (clipId: string) => void;
}
