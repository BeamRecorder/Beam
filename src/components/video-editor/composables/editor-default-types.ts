import type {
  BlurClip,
  CaptionStyle,
  ClipAppearance,
  ClipTransitions,
  NormalizedTransform,
  VisualClip,
} from '~/media/shared/composition-types';
import type { ProjectEditorPresentation } from '~/api/types/capture-api';
import type { ZoomDepth, ZoomMode, ZoomMotionBlurSettings } from '../zoom/zoom-types';
import type { CameraFramingPreset, CameraLayoutPreset } from '~/media/shared/camera-layout-types';

export interface VisualClipDefaults {
  transform: NormalizedTransform;
  appearance: ClipAppearance;
  isMirrored: boolean;
  isMirroredY: boolean;
  playbackRate: number;
  transitions: ClipTransitions;
  cameraLayoutPreset: CameraLayoutPreset;
  cameraFramingPreset: CameraFramingPreset;
  cameraSplitRatio?: number;
  cameraSplitPadding?: number;
  reactToZoom?: boolean;
}

export interface EditorPreferenceDefaults {
  schemaVersion: 1;
  presentation?: Omit<ProjectEditorPresentation, 'importedBackgrounds'>;
  visual?: Partial<Record<VisualClip['kind'], VisualClipDefaults>>;
  caption?: { style: Omit<CaptionStyle, 'customText'>; transform?: NormalizedTransform; durationMs: number };
  blur?: Pick<
    BlurClip,
    'transform' | 'shape' | 'mode' | 'strength' | 'feather' | 'cornerRadius' | 'tintOpacity' | 'color'
  >;
  audio?: { volume: number; playbackRate: number };
  zoom?: { durationMs: number; depth: ZoomDepth; mode: ZoomMode };
  zoomMotionBlur?: ZoomMotionBlurSettings;
}
