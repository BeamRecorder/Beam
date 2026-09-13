import type { CropDimensions } from '../composition/crop/crop-types';
import type {
  BlurEffectMode,
  BlurEffectShape,
  ClipFrame,
  ClipShadowMode,
  NormalizedCrop,
  NormalizedTransform,
} from '~/media/shared/composition-types';
import type { CameraFramingPreset, CameraLayoutPreset } from '~/media/shared/camera-layout-types';
import type { PhoneFrameFill } from '~/media/shared/color-fill-types';
import type { AudioNormalization } from '~/media/shared/audio-normalization-types';

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
  frameShowMenu?: boolean;
  frameShowScrollbars?: boolean;
  frameChromeScale?: number;
  phoneFrameFill?: PhoneFrameFill;
  clipTransform?: NormalizedTransform;
  isMirrored?: boolean;
  isMirroredY?: boolean;
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
}
