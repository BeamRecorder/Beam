import type { CompositionSceneLayers } from '@beam/engine/composition/scene-layers';
import type { RenderedVideoWindow } from './composables/useCameraZoom';
import type { ProjectEditorData } from '../../../api/types/capture-api';
import type {
  CursorAutoHideSettings,
  CursorClickEffects,
  CursorMotionSettings,
} from '@beam/engine/capture/cursor-settings';
import type { HistoryAction } from '../composables/useEditorUndoRedo';
import type { BackgroundValue } from '@beam/engine/shared/background-types';
import type { CursorPackDescriptor, CursorSelection } from '@beam/engine/capture/cursor-pack';
import type { ShadowDirection } from '@beam/runtime/cursor/shadow-types';
import type { ZoomAutoFollowSettings, ZoomElement, ZoomMotionBlurSettings } from '@beam/engine/zoom/zoom-types';
import type { MediaError, MediaFrame } from '@beam/runtime/shared/index';
import type {
  CaptionClip,
  BlurClip,
  ColorClip,
  ClipComposition,
  NormalizedCrop,
  NormalizedTransform,
  ShapeClip,
  VisualClip,
} from '@beam/engine/shared/composition-types';
import type { OutputCanvasSettings } from '@beam/engine/layout/output-canvas';
import type { PreviewQuality } from '@beam/runtime/playback/index';
import type { CaptionInlineEditingEnd, CaptionInlineTextUpdate } from './caption-inline-editor-types';
import type { CanvasFrameCapture } from './canvas-frame-capture';

export type TransformClip = VisualClip | ColorClip | ShapeClip | BlurClip | CaptionClip;
export interface ClipTransformUpdate {
  id: string;
  transform: NormalizedTransform;
}
export const transformCaptionFollowsCursor = (clip: TransformClip | null) =>
  clip?.kind === 'caption' && clip.caption.type === 'keyboard' && clip.caption.followCursor;

export interface EditorCanvasProps {
  isPlaying: boolean;
  currentTime: number;
  duration?: number;
  cursorSelection: CursorSelection;
  cursorPack: CursorPackDescriptor | null;
  cursorSize: number;
  cursorColor: string;
  enableShadow: boolean;
  shadowBlur: number;
  shadowColor: string;
  shadowDirection: ShadowDirection;
  clickEffects: CursorClickEffects;
  motion: CursorMotionSettings;
  autoHide: CursorAutoHideSettings;
  selectedBackground: BackgroundValue | null;
  backgroundBlurPercent?: number;
  frameFor: (clipId: string) => MediaFrame | null;
  frameVersion: number;
  captureCompositionPreview?: () => Promise<CanvasFrameCapture>;
  domPreviewActive?: boolean;
  previewQuality: PreviewQuality;
  playbackState: 'idle' | 'loading' | 'paused' | 'playing' | 'error' | 'disposed';
  playbackError: MediaError | null;
  editorData?: ProjectEditorData | null;
  zoomElements: ZoomElement[];
  zoomMotionBlur?: ZoomMotionBlurSettings;
  zoomAutoFollow?: ZoomAutoFollowSettings;
  selectedZoom: ZoomElement | null;
  composition: ClipComposition;
  outputCanvas: OutputCanvasSettings;
  activeTab: string;
  selectedTransformClip: TransformClip | null;
  selectedClipIds?: string[];
  transformHandlesMuted?: boolean;
  loopProgress?: number;
  isCropping?: boolean;
  isGridVisible?: boolean;
  historyAction?: HistoryAction | null;
}

export interface EditorCanvasEmits {
  (event: 'update:zoom', value: ZoomElement): void;
  (event: 'select:clip', clipId: string): void;
  (event: 'select:clips', selection: { ids: string[]; primaryId: string | null; additive: boolean }): void;
  (event: 'deselect:transform-clip'): void;
  (event: 'deselect:zoom'): void;
  (event: 'update:clip-transform', transform: NormalizedTransform): void;
  (event: 'update:clip-transforms', transforms: ClipTransformUpdate[]): void;
  (event: 'preview:clip-crop', crop: NormalizedCrop | null): void;
  (event: 'update:clip-crop', crop: NormalizedCrop): void;
  (event: 'preview:clip-rotation', rotation: number | null): void;
  (event: 'update:clip-rotation', rotation: number): void;
  (event: 'request:crop', clipId: string): void;
  (event: 'select:canvas'): void;
  (event: 'select:cursor'): void;
  (event: 'update:cursor-size', value: number): void;
  (event: 'done:crop'): void;
  (event: 'update:caption-text', value: CaptionInlineTextUpdate): void;
  (event: 'caption-editing-start'): void;
  (event: 'caption-editing-end', value: CaptionInlineEditingEnd): void;
}

export type DrawVisualStack = (
  ctx: CanvasRenderingContext2D,
  videoWindow: RenderedVideoWindow,
  drawScreen: () => void,
  layers: CompositionSceneLayers,
) => void;
