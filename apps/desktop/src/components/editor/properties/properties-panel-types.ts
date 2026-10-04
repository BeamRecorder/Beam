import type { CropDimensions } from '@beam/engine/shared/crop-types';
import type {
  BlurEffectMode,
  BlurEffectShape,
  ClipFrame,
  ClipFrameTheme,
  ClipShadowMode,
  NormalizedCrop,
  NormalizedTransform,
} from '@beam/engine/shared/composition-types';
import type { CameraFramingPreset, CameraLayoutPreset } from '@beam/engine/shared/camera-layout-types';
import type { PhoneFrameFill } from '@beam/engine/shared/color-fill-types';
import type { AudioNormalization } from '@beam/engine/shared/audio-normalization-types';

export interface SelectedClipProperties {
  id: string;
  kind: string;
  name?: string;
  timelineStartMs: number;
  timelineDurationMs: number;
  playbackRate?: number;
  enabled?: boolean;
  isLinked?: boolean;
  crop?: NormalizedCrop;
  cropDimensions?: CropDimensions | null;
  shadowBlur?: number;
  shadowMode?: ClipShadowMode;
  shadowSize?: string;
  shadowColor?: string;
  shadowDirection?: string;
  cornerRadius?: string | number;
  borderEnabled?: boolean;
  borderColor?: string;
  borderWidth?: number;
  frame?: ClipFrame;
  frameTitle?: string;
  frameColor?: string;
  frameTheme?: ClipFrameTheme;
  frameShowMenu?: boolean;
  frameShowScrollbars?: boolean;
  frameChromeScale?: number;
  phoneFrameFill?: PhoneFrameFill;
  clipTransform?: NormalizedTransform;
  isMirrored?: boolean;
  isMirroredY?: boolean;
  rotation?: number;
  cameraLayoutPreset?: CameraLayoutPreset;
  cameraFramingPreset?: CameraFramingPreset;
  cameraSplitRatio?: number;
  cameraSplitPadding?: number;
  reactToZoom?: boolean;
  hasLinkedScreen?: boolean;
  volume?: number;
  normalization?: AudioNormalization;
  blurMode?: BlurEffectMode;
  blurShape?: BlurEffectShape;
  blurStrength?: number;
  blurFeather?: number;
  blurCornerRadius?: number;
  blurTintOpacity?: number;
  blurColor?: string;
  highlightColor?: string;
}
