import type { CursorPackDescriptor, CursorSelection } from '~/api/types/cursor-pack';
import type { BackgroundMedia, BackgroundMediaGroup, BackgroundValue } from '../composables/backgroundCatalog';
import type {
  BlurEffectMode,
  BlurEffectShape,
  CaptionClip,
  ClipFrame,
  ClipComposition,
  NormalizedTransform,
  NormalizedCrop,
} from '~/media/shared/composition-types';
import type { ProjectEditorData } from '../../../api/types/capture-api';
import type { OutputCanvasSettings } from '../canvas/output-canvas';
import type { ShadowDirection } from './cursor/shadow-types';
import type {
  CursorAutoHideSettings,
  CursorClickEffects,
  CursorMotionSettings,
} from '../../../api/types/cursor-settings';
import type { SelectedClipProperties } from './properties-panel-types';
import type { CameraFramingPreset, CameraLayoutPreset } from '~/media/shared/camera-layout-types';
import type { PhoneFrameFill } from '~/media/shared/color-fill-types';
import type { ZoomAutoFollowSettings, ZoomElement, ZoomMotionBlurSettings } from '../zoom/zoom-types';

export interface PropertiesPanelProps {
  activeTab: string;
  selectedClip?: SelectedClipProperties | null;
  selectedCaptionClip?: CaptionClip | null;
  selectedClipIds?: string[];
  selectedZoomIds?: string[];
  cursorSelection: CursorSelection;
  cursorPacks: CursorPackDescriptor[];
  cursorSize: number;
  cursorColor: string;
  enableShadow: boolean;
  shadowBlur: number;
  shadowColor: string;
  shadowDirection: ShadowDirection;
  clickEffects: CursorClickEffects;
  motion: CursorMotionSettings;
  autoHide: CursorAutoHideSettings;
  volume: number;
  isSystemAudioEnabled: boolean;
  isMicAudioEnabled: boolean;
  hasSystemAudio?: boolean;
  hasMicAudio?: boolean;
  systemVolume?: number;
  micVolume?: number;
  selectedBackground: BackgroundValue | null;
  blurPercent: number;
  backgroundGroups: BackgroundMediaGroup[];
  selectedZoom: ZoomElement | null;
  canGenerateZooms: boolean;
  hasAutomaticZooms: boolean;
  zoomAutoFollow?: ZoomAutoFollowSettings;
  zoomMotionBlur?: ZoomMotionBlurSettings;
  composition: ClipComposition;
  editorData?: ProjectEditorData | null;
  timelineDurationMs: number;
  projectId?: string | null;
  canvas: OutputCanvasSettings;
  audioNormalizationStatuses?: Record<string, 'analyzing' | 'ready' | 'silent' | 'error' | undefined>;
  audioNormalizationErrors?: Record<string, string | undefined>;
}
export interface PropertiesPanelEmits {
  (event: 'update:cursorSelection', value: CursorSelection): void;
  (event: 'preview:cursorSelection', value: CursorSelection | null): void;
  (event: 'update:cursorSize', value: number): void;
  (event: 'update:cursorColor', value: string): void;
  (event: 'update:enableShadow', value: boolean): void;
  (event: 'update:shadowBlur', value: number): void;
  (event: 'update:shadowColor', value: string): void;
  (event: 'update:shadowDirection', value: ShadowDirection): void;
  (event: 'update:clickEffects', value: CursorClickEffects): void;
  (event: 'update:motion', value: CursorMotionSettings): void;
  (event: 'update:autoHide', value: CursorAutoHideSettings): void;
  (event: 'update:volume', value: number): void;
  (event: 'update:isSystemAudioEnabled', value: boolean): void;
  (event: 'update:isMicAudioEnabled', value: boolean): void;
  (event: 'update:systemVolume', value: number): void;
  (event: 'update:micVolume', value: number): void;
  (event: 'update:selectedBackground', value: BackgroundValue): void;
  (event: 'update:blurPercent', value: number): void;
  (event: 'import:background', value: BackgroundMedia): void;
  (event: 'update:canvas', value: OutputCanvasSettings): void;
  (event: 'update:zoom', value: ZoomElement): void;
  (event: 'update:zoomAutoFollow', value: ZoomAutoFollowSettings): void;
  (event: 'update:zoomMotionBlur', value: ZoomMotionBlurSettings): void;
  (event: 'delete:zoom'): void;
  (event: 'generate:zooms'): void;
  (event: 'update:caption', value: CaptionClip): void;
  (event: 'update:composition', value: ClipComposition): void;
  (event: 'preview:composition', value: ClipComposition | null): void;
  (event: 'select-caption', clipId: string): void;
  (event: 'update:clip-rate', rate: number): void;
  (event: 'update:clip-enabled', enabled: boolean): void;
  (event: 'update:clip-volume', volume: number): void;
  (
    event: 'update:blur',
    patch: Partial<{
      mode: BlurEffectMode;
      shape: BlurEffectShape;
      strength: number;
      feather: number;
      cornerRadius: number;
      tintOpacity: number;
      color: string;
    }>,
  ): void;
  (event: 'update:clip-is-mirrored', isMirrored: boolean): void;
  (event: 'update:clip-is-mirrored-y', isMirroredY: boolean): void;
  (event: 'update:clip-corner-radius', radius: string): void;
  (event: 'corner-radius-interaction', interacting: boolean): void;
  (event: 'update:clip-shadow', shadow: { size: string; color?: string; direction?: string }): void;
  (
    event: 'update:clip-appearance',
    appearance: {
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
    },
  ): void;
  (event: 'update:clip-crop', crop: NormalizedCrop): void;
  (event: 'preview:clip-crop', crop: NormalizedCrop | null): void;
  (event: 'update:clip-transform', transform: NormalizedTransform): void;
  (event: 'update:camera-layout', preset: Exclude<CameraLayoutPreset, 'custom'>): void;
  (event: 'update:camera-framing', preset: Exclude<CameraFramingPreset, 'custom'>): void;
  (event: 'update:camera-split-ratio', ratio: number): void;
  (event: 'update:camera-split-padding', padding: number): void;
  (event: 'update:webcam-react-to-zoom', enabled: boolean): void;
  (event: 'reset:clip-transform'): void;
  (event: 'unlink-clip'): void;
  (event: 'delete-clip'): void;
  (event: 'delete:system-audio'): void;
  (event: 'delete:mic-audio'): void;
  (event: 'normalize:audio', clipIds: string[]): void;
  (event: 'reset:audio-normalization', clipIds: string[]): void;
  (event: 'split-clip'): void;
  (event: 'back-to-hud'): void;
}
