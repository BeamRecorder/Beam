import type { ProjectEditorData } from '../../../api/types/capture-api';
import type { CursorClickEffects, CursorMotionSettings } from '../../../api/types/cursor-settings';
import type { HistoryAction } from '../composables/useEditorUndoRedo';
import type { BackgroundValue } from '../composables/backgroundCatalog';
import type { CursorType } from '../properties/cursor/useCursorReplacer';
import type { ShadowDirection } from '../properties/cursor/shadow-types';
import type { ZoomElement } from '../zoom/zoom-types';
import type { MediaError, MediaFrame } from '~/media/shared';
import type {
  CaptionClip,
  BlurClip,
  ClipComposition,
  NormalizedCrop,
  NormalizedTransform,
  VisualClip,
} from '~/media/shared/composition-types';
import type { OutputCanvasSettings } from './output-canvas';

export type TransformClip = VisualClip | BlurClip | CaptionClip;

export interface EditorCanvasProps {
  isPlaying: boolean;
  currentTime: number;
  selectedCursor: CursorType;
  cursorSize: number;
  cursorColor: string;
  enableShadow: boolean;
  shadowBlur: number;
  shadowColor: string;
  shadowDirection: ShadowDirection;
  clickEffects: CursorClickEffects;
  motion: CursorMotionSettings;
  selectedBackground: BackgroundValue | null;
  backgroundBlurPercent?: number;
  frameFor: (clipId: string) => MediaFrame | null;
  frameVersion: number;
  playbackState: 'idle' | 'loading' | 'paused' | 'playing' | 'error' | 'disposed';
  playbackError: MediaError | null;
  editorData?: ProjectEditorData | null;
  zoomElements: ZoomElement[];
  selectedZoom: ZoomElement | null;
  composition: ClipComposition;
  outputCanvas: OutputCanvasSettings;
  activeTab: string;
  selectedTransformClip: TransformClip | null;
  loopProgress?: number;
  isCropping?: boolean;
  isGridVisible?: boolean;
  historyAction?: HistoryAction | null;
}

export interface EditorCanvasEmits {
  (event: 'update:zoom', value: ZoomElement): void;
  (event: 'preview:zoom', value: ZoomElement): void;
  (event: 'select:clip', clipId: string): void;
  (event: 'deselect:transform-clip'): void;
  (event: 'deselect:zoom'): void;
  (event: 'update:clip-transform', transform: NormalizedTransform): void;
  (event: 'update:clip-crop', crop: NormalizedCrop): void;
  (event: 'select:canvas'): void;
  (event: 'done:crop'): void;
}
