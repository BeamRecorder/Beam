import type { Ref, ComputedRef } from 'vue';
import type { CapturePreview, CaptureSource, EditorLoadingProgress } from '~/api/types/capture-api';

export interface HudProps {
  embedded: boolean;
  showTopbar: boolean;
  preparingEditor: boolean;
  editorLoadingProgress: EditorLoadingProgress;
  externalError?: string;
}
export type HudEmit = (
  event: 'start-recording' | 'stop-recording' | 'open-project' | 'focus-feature',
  ...args: unknown[]
) => void;
export interface SavedDevices {
  cameraId?: string;
  micId?: string;
  systemAudioMode?: 'on' | 'off';
}
export type PreviewKind = 'screen' | 'window';
export interface HudWindowOptions {
  props: HudProps;
  activeTab: Ref<PreviewKind>;
  isBusy: Ref<boolean>;
  isRecording: Ref<boolean>;
  errorMessage: Ref<string>;
  selectedScreen: ComputedRef<CaptureSource | null>;
  selectedScreenId: Ref<string | null>;
  selectedScreenPreview: ComputedRef<CapturePreview | null>;
  showSettings: Ref<boolean>;
  showProjectPicker: Ref<boolean>;
  loadPreviews: (kind: PreviewKind) => Promise<void>;
  refreshInteraction: () => Promise<unknown>;
}
