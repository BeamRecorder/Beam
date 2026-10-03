import type { CaptureMode } from '@beam/engine/capture/capture-mode';
import type { HudCaptureTarget } from '../hud/hud-state-types';

export interface QuickSnipSelectionState {
  displayMode: 'studio' | 'screenshot';
  mode: CaptureMode;
  settingsDisabled: boolean;
  microphone: boolean;
  microphoneLevel: number;
  systemAudio: boolean;
  systemAudioLevel: number;
  camera: boolean;
  captureTarget: HudCaptureTarget;
  settingsOpen: boolean;
  captureHint: string;
  preparing: boolean;
  actionPending: boolean;
  configured: boolean;
  deviceMenuBusy: boolean;
}
