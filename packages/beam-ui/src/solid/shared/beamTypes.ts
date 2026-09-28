export type CaptureMode = 'recorder' | 'screenshot' | 'instant'
export type SourceMode = 'display' | 'region' | 'window'
export type ResizeDirection = 'north' | 'northEast' | 'east' | 'southEast' | 'south' | 'southWest' | 'west' | 'northWest'
export type AuxiliaryWindow = 'regionControls' | 'regionActions' | 'countdown' | 'recorder' | 'settings' | 'windowPicker' | 'windowHighlight' | 'teleprompter'
export type RecordingPhase = 'idle' | 'preparing' | 'armed' | 'recording' | 'paused' | 'finalizing' | 'completed' | 'failed' | 'interrupted'

export interface SourceOption { id: string; label: string; kind?: string; isDefault?: boolean }
export interface SourceCatalog {
  screens: SourceOption[]
  cameras: SourceOption[]
  microphones: SourceOption[]
  systemOutputs: SourceOption[]
  errors: string[]
}
export interface BeamPreferences {
  locale: import('../../../../../src/i18n/types').AppLocale
  theme: 'light' | 'dark' | 'system'
  captureMode: CaptureMode
  hudWindow: { width: number; height: number }
  hudPosition?: { x: number; y: number } | null
  shortcuts: Record<string, string>
  devices: { camera?: string; microphone?: string; systemAudio?: string }
  countdownSeconds: number
}
export interface RecordingStatus {
  state: RecordingPhase
  sessionId: string | null
  projectId?: string | null
  manifestPath?: string | null
  error?: string | null
}
export interface CaptureRequest {
  mode: CaptureMode
  sourceMode: SourceMode
  sourceId: string | null
  cameraId: string | null
  microphoneId: string | null
  systemAudioId: string | null
  region?: { x: number; y: number; width: number; height: number }
}

export interface MonitorInfo { name: string | null; x: number; y: number; width: number; height: number; scaleFactor: number; primary: boolean }
export interface WindowChoice { generation: number; id: string; label: string; x: number; y: number; width: number; height: number }
export interface BeamUiState { remaining: number; shortcut: string; paused: boolean; busy: boolean; regionRevision: number }
export type BeamEvent = {
  type: 'preferencesChanged'; preferences: BeamPreferences;
} | {
  type: string; id?: string; state?: string; action?: string; window?: string; visible?: boolean;
  sourceId?: string; region?: CaptureRequest['region'];
  value?: BeamUiState;
  preferences?: never;
  physicalWidth?: number; physicalHeight?: number; scaleFactor?: number;
  scheme?: string;
  snapshot?: RegionSnapshot;
  update?: import('./settings/updateTypes').UpdateSnapshot;
}
export interface InputAccessStatus { state: 'available' | 'permission-required' | 'installation-required' | 'unavailable' | 'denied'; canRequest: boolean; clicks: boolean; shortcuts: boolean; error?: { code: string; message: string } }
export interface ApplicationInfo {
  version: string; operatingSystem: string; architecture: string; logicalProcessors: number; desktopSession: string | null
}
export interface RegionSnapshot {
  revision: number; width: number; height: number; preset: string; selected: boolean; canRecord: boolean;
  controlsX: number; controlsY: number; actionsX: number; actionsY: number;
}
/** Colors shared with the native Rust region mask and its drawing feedback. */
export interface RegionColors {
  instruction: string;
  border: string;
  accent: string;
  surface: string;
  foreground: string;
  dim: string;
}
