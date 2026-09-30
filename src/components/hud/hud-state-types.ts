import type { Ref, ComputedRef } from 'vue';
import type {
  CapturePreview,
  CaptureSource,
  EditorLoadingProgress,
  RecorderLauncherContext,
} from '~/api/types/capture-api';

export interface HudProps {
  embedded: boolean;
  showTopbar: boolean;
  preparingEditor: boolean;
  editorLoadingProgress: EditorLoadingProgress;
  externalError?: string;
  recorderLauncherContext?: RecorderLauncherContext | null;
}
export type HudEmit = (
  event:
    | 'start-recording'
    | 'stop-recording'
    | 'open-project'
    | 'focus-feature'
    | 'dismiss-launcher'
    | 'popover-toggle',
  ...args: unknown[]
) => void;
export interface SavedDevices {
  cameraId?: string;
  micId?: string;
  systemAudioMode?: 'on' | 'off';
}
export type PreviewKind = 'screen' | 'window';
export type HudCaptureTarget = PreviewKind | 'region';
export interface HudCaptureActionsOptions {
  platform: string;
  blocked: ComputedRef<boolean>;
  activeTab: Ref<PreviewKind>;
  selectedScreenId: Ref<string | null>;
  selectedSourceId: Ref<string | null>;
  sources: Ref<CaptureSource[]>;
  windowPreviews: Ref<CapturePreview[]>;
  resetRegion: () => void;
  selectRegion: () => Promise<boolean>;
  refreshSources: (kind: PreviewKind) => Promise<void>;
  start: () => Promise<void>;
}
export interface HudWindowOptions {
  props: HudProps;
  activeTab: Ref<PreviewKind>;
  isBusy: Ref<boolean>;
  isRecording: Ref<boolean>;
  errorMessage: Ref<string>;
  selectedScreen: ComputedRef<CaptureSource | null>;
  selectedScreenId: Ref<string | null>;
  selectedScreenPreview: ComputedRef<CapturePreview | null>;
  loadPreviews: (kind: PreviewKind) => Promise<void>;
}
