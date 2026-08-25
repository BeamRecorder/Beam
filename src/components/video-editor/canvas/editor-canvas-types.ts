import type { ProjectEditorData } from '../../../api/types/capture-api';
import type {
  CursorAutoHideSettings,
  CursorClickEffects,
  CursorMotionSettings,
} from '../../../api/types/cursor-settings';
import type { HistoryAction } from '../composables/useEditorUndoRedo';
import type { BackgroundValue } from '../composables/backgroundCatalog';
import type { CursorPackDescriptor, CursorSelection } from '../../../api/types/cursor-pack';
import type { ShadowDirection } from '../properties/cursor/shadow-types';
import type { ZoomElement, ZoomMotionBlurSettings } from '../zoom/zoom-types';
import type { MediaError, MediaFrame } from '~/media/shared';
import type {
  CaptionClip,
  BlurClip,
  ColorClip,
  ClipComposition,
  NormalizedCrop,
  NormalizedTransform,
  ShapeClip,
  VisualClip,
} from '~/media/shared/composition-types';
import type { OutputCanvasSettings } from './output-canvas';
import type { PreviewQuality } from '~/media/playback';
import type { CaptionInlineEditingEnd, CaptionInlineTextUpdate } from './caption-inline-editor-types';

export type TransformClip = VisualClip | ColorClip | ShapeClip | BlurClip | CaptionClip;
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
  previewQuality: PreviewQuality;
  playbackState: 'idle' | 'loading' | 'paused' | 'playing' | 'error' | 'disposed';
  playbackError: MediaError | null;
  editorData?: ProjectEditorData | null;
  zoomElements: ZoomElement[];
  zoomMotionBlur?: ZoomMotionBlurSettings;
  selectedZoom: ZoomElement | null;
  composition: ClipComposition;
  outputCanvas: OutputCanvasSettings;
  activeTab: string;
  selectedTransformClip: TransformClip | null;
  transformHandlesMuted?: boolean;
  loopProgress?: number;
  isCropping?: boolean;
  isGridVisible?: boolean;
  historyAction?: HistoryAction | null;
}

export interface EditorCanvasEmits {
  (event: 'update:zoom', value: ZoomElement): void;
  (event: 'select:clip', clipId: string): void;
  (event: 'deselect:transform-clip'): void;
  (event: 'deselect:zoom'): void;
  (event: 'update:clip-transform', transform: NormalizedTransform): void;
  (event: 'update:clip-crop', crop: NormalizedCrop): void;
  (event: 'select:canvas'): void;
  (event: 'select:cursor'): void;
  (event: 'update:cursor-size', value: number): void;
  (event: 'done:crop'): void;
  (event: 'update:caption-text', value: CaptionInlineTextUpdate): void;
  (event: 'caption-editing-start'): void;
  (event: 'caption-editing-end', value: CaptionInlineEditingEnd): void;
}
