export type CaptureMode = 'recorder' | 'screenshot' | 'instant'
export type SourceMode = 'display' | 'region' | 'window'
export type ResizeDirection = 'north' | 'northEast' | 'east' | 'southEast' | 'south' | 'southWest' | 'west' | 'northWest'
export type AuxiliaryWindow = 'regionControls' | 'regionActions' | 'countdown' | 'recorder' | 'settings' | 'windowPicker' | 'windowHighlight' | 'teleprompter' | 'projects' | 'editorLoading'
export interface NativeProjectSummary {
  id: string
  name: string
  kind: 'recording' | 'instant' | 'project'
  updatedAtMs: number
}
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
  windowPositions?: Record<string, { x: number; y: number }>
  shortcuts: Record<string, string>
  devices: { camera?: string; microphone?: string; systemAudio?: string }
  countdownSeconds: number
  hideTaskbar?: boolean
  hideDesktopIcons?: boolean
}
export interface DesktopCapabilities { taskbar: boolean; desktopIcons: boolean; captureOnly: boolean }
export type CaptureQuickSettings = Pick<BeamPreferences, 'countdownSeconds' | 'hideTaskbar' | 'hideDesktopIcons'>
export interface RecordingStatus {
  state: RecordingPhase
  sessionId: string | null
  projectId?: string | null
  manifestPath?: string | null
  manifest?: { durationNs: number } | null
  error?: string | null
}
export interface AudioLevel { timestampNs: number; peak: number; rms: number }
export interface AudioLevels { microphone: AudioLevel | null; systemAudio: AudioLevel | null }
export interface AudioPreviewRequest { microphoneId: string | null; systemAudioId: string | null }
export type CaptureDevice = 'camera' | 'microphone' | 'systemAudio'
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
export interface WindowPosition { x: number; y: number }
export interface WindowGeometry { x?: number | null; y?: number | null; width: number; height: number; scaleFactor: number }
export interface WindowChoice { generation: number; id: string; label: string; x: number; y: number; width: number; height: number }
export interface BeamUiState {
  remaining: number; shortcut: string; pauseShortcut?: string; paused: boolean; busy: boolean; regionRevision: number;
  microphoneEnabled?: boolean; systemAudioEnabled?: boolean; cameraEnabled?: boolean;
  preparationSource?: SourceMode;
}
export type BeamEvent = {
  type: 'preferencesChanged'; preferences: BeamPreferences;
} | {
  type: string; id?: string; state?: string; action?: string; window?: string; visible?: boolean;
  sourceId?: string; region?: CaptureRequest['region'];
  value?: BeamUiState;
  preferences?: never;
  physicalWidth?: number; physicalHeight?: number; scaleFactor?: number;
  scheme?: string;
  x?: number; y?: number;
  snapshot?: RegionSnapshot;
  projectId?: string; sequenceId?: string; revision?: number;
  update?: import('./settings/updateTypes').UpdateSnapshot;
}
export interface InputAccessStatus { state: 'available' | 'permission-required' | 'installation-required' | 'unavailable' | 'denied'; canRequest: boolean; clicks: boolean; shortcuts: boolean; error?: { code: string; message: string } }
export interface ApplicationInfo {
  version: string; operatingSystem: string; architecture: string; logicalProcessors: number; desktopSession: string | null
}
export interface RegionSnapshot {
  open?: boolean; dragging?: boolean;
  revision: number; width: number; height: number; preset: string; selected: boolean; canRecord: boolean;
  controlsX: number; controlsY: number; controlsWidth: number; controlsHeight: number;
  actionsX: number; actionsY: number; actionsWidth: number; actionsHeight: number;
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
