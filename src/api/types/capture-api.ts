import type { CaptureConfig, CreateProjectOptions, StartRecordingOptions } from './capture-config';
import type {
  ScreenRegion,
  ScreenRegionBounds,
  ScreenRegionOverlayOptions,
  ScreenRegionSelectionOptions,
  ScreenRegionSelectionResult,
} from './screen-region';
import type { CaptureProject, CaptureSession, ProjectEditorData, ProjectZoomState } from './capture-session';
import type { ClipComposition, MediaAsset } from '~/media/shared/composition-types';
import type {
  BackgroundMedia,
  BackgroundValue,
  GradientBackground,
} from '../../components/video-editor/composables/backgroundCatalog';
import type { OutputCanvasSettings } from '../../components/video-editor/canvas/output-canvas';
import type { CursorPresentationSettings } from './cursor-presentation';
import type { CursorPackDescriptor, CursorPackImportResult } from './cursor-pack';
import type {
  TeleprompterDocument,
  TeleprompterSessionContext,
} from '../../components/hud/teleprompter/teleprompter-types';
import type { RecordingBarVisibility } from '../../components/hud/recorder/recording-types';
import type {
  EditorLoadingProgress,
  EditorLoadingStage,
  EditorOpenOptions,
  RecorderLauncherContext,
} from './editor-window';
import type { AppearanceSettings } from '~/types/appearance';

export type * from './capture-config';
export type * from './screen-region';
export type * from './capture-session';
export type * from './editor-window';
export type * from './cursor-pack';
export type * from '~/types/appearance';

export interface ImportedFont {
  id: string;
  family: string;
  fullName: string;
  extension: '.ttf' | '.otf' | '.woff' | '.woff2';
  url: string;
}

export interface CaptureApi {
  readonly platform: string;
  discover(): Promise<CaptureCatalog>;
  capabilities(): Promise<Record<string, boolean>>;
  permissions(): Promise<Record<string, unknown>>;
  inputAccessStatus(): Promise<InputAccessStatus>;
  requestInputAccess(): Promise<InputAccessStatus>;
  formats(sourceId: string): Promise<unknown>;
  prepare(config: CaptureConfig): Promise<CaptureSession>;
  prepareRecording(options?: StartRecordingOptions): Promise<CaptureSession>;
  startPreparedRecording(): Promise<CaptureSession>;
  stopNativeRecording(): Promise<CaptureSession>;
  completeNativeRecording(): Promise<CaptureSession>;
  cancelPreparedRecording(): Promise<void>;
  discardRecording(sessionId?: string): Promise<void>;
  startRecording(options?: StartRecordingOptions): Promise<CaptureSession>;
  start(config?: CaptureConfig): Promise<CaptureSession>;
  pause(): Promise<CaptureSession>;
  resume(): Promise<CaptureSession>;
  stop(): Promise<CaptureSession>;
  status(): Promise<CaptureSession>;
  startSystemAudioPreview(): Promise<void>;
  systemAudioPreviewLevel(): Promise<number>;
  stopSystemAudioPreview(): Promise<void>;
  getSourcePreview(request: CaptureSourcePreviewRequest): Promise<CaptureSourcePreview>;
}

export interface DesktopCaptureApi extends CaptureApi {
  close(): void;
  quit(): void;
  minimize(): void;
  toggleDevTools?(): void;
  updateTrayMenu?(labels: {
    openHud?: string;
    stopRecording?: string;
    quit?: string;
    tooltip?: string;
    recording?: boolean;
  }): void;
  onTrayStopRecording?(listener: () => void): () => void;
  setWindowMode(mode: 'hud' | 'recorder'): void;
  showHud(): void;
  openEditor(projectId: string, options?: EditorOpenOptions): Promise<boolean>;
  openRecorderFromEditor(): Promise<boolean>;
  dismissRecorderLauncher(): Promise<boolean>;
  setRecorderLauncherActive(active: boolean): void;
  getEditorContext(): Promise<{ projectId: string } | null>;
  notifyEditorReady(): void;
  reportEditorLoadingStage(stage: EditorLoadingStage): void;
  setEditorTitlebarTheme(dark: boolean): void;
  onEditorContext(listener: (context: { projectId: string }) => void): () => void;
  onEditorLoadingProgress(listener: (progress: EditorLoadingProgress) => void): () => void;
  onRecorderLauncherContext(listener: (context: RecorderLauncherContext | null) => void): () => void;
  setPosition(x: number, y: number): void;
  setSize(width: number, height: number): void;
  setSizeSmooth(width: number, height: number): void;
  setWindowVisible(visible: boolean): void;
  setInteractive(overInteractive: boolean): void;
  setCountdown(seconds: number | null): Promise<void>;
  prepareRecordingSurface(): Promise<void>;
  onCountdown(listener: (seconds: number | null) => void): () => void;
  getSources(types?: string[]): Promise<CapturePreview[]>;
  getDisplayBounds(displayId: string): Promise<ScreenRegionBounds | null>;
  selectScreenRegion(options: ScreenRegionSelectionOptions): Promise<ScreenRegionSelectionResult | null>;
  showScreenRegionOverlay(options: ScreenRegionOverlayOptions): void;
  hideScreenRegionOverlay(): void;
  onScreenRegionConfigure(
    listener: (options: ScreenRegionOverlayOptions & { mode?: 'select' | 'record' }) => void,
  ): () => void;
  confirmScreenRegion(region: ScreenRegion): void;
  cancelScreenRegion(): void;
  getWindowBounds(): Promise<{ x: number; y: number; width: number; height: number } | null>;
  getPreferences(): Promise<PreferenceSettings>;
  updatePreferences(patch: PreferencePatch): Promise<PreferenceSettings>;
  resetPreferences(keys?: Array<keyof PreferenceSettings>): Promise<PreferenceSettings>;
  onPreferencesChanged(listener: (preferences: PreferenceSettings) => void): () => void;
  onPreferenceShortcut(listener: (id: string) => void): () => void;
  showTeleprompter(): void;
  hideTeleprompter(): void;
  toggleTeleprompterVisibility(): void;
  setTeleprompterSession(context: TeleprompterSessionContext | null): void;
  notifyTeleprompterReady?: () => void;
  onTeleprompterShortcut(listener: (id: string) => void): () => void;
  onTeleprompterSession(listener: (context: TeleprompterSessionContext | null) => void): () => void;
  onTeleprompterVisibility(listener: (visible: boolean) => void): () => void;
  saveSessionTeleprompter(
    projectId: string,
    sessionId: string,
    document: TeleprompterDocument,
  ): Promise<TeleprompterDocument>;
  getSessionTeleprompter(projectId: string, sessionId: string): Promise<TeleprompterDocument | null>;
  listProjects(): Promise<CaptureProject[]>;
  projectMediaUrl(source: string): Promise<string | null>;
  getProjectEditorData(projectId: string): Promise<ProjectEditorData | null>;
  getProjectEditorState(projectId: string): Promise<ProjectEditorState>;
  saveProjectEditorState(projectId: string, state: ProjectEditorState): Promise<ProjectEditorState>;
  pickProjectMedia(projectId: string, kind: 'video' | 'image' | 'audio'): Promise<MediaAsset | null>;
  importDroppedProjectMedia(projectId: string, file: File, kind: 'video' | 'image' | 'audio'): Promise<MediaAsset>;
  beginProjectVoiceover(payload: ProjectVoiceoverStart): Promise<{ recordingId: string }>;
  writeProjectVoiceoverChunk(payload: ProjectVoiceoverChunk): Promise<void>;
  finalizeProjectVoiceover(payload: ProjectVoiceoverFinish): Promise<MediaAsset>;
  abortProjectVoiceover(recordingId: string): Promise<void>;
  listBackgroundLibrary(): Promise<BackgroundMedia[]>;
  pickBackgroundLibraryMedia(kind?: 'image' | 'video' | 'media'): Promise<BackgroundMedia | null>;
  onBackgroundLibraryChanged(listener: () => void): () => void;
  listImportedFonts(): Promise<ImportedFont[]>;
  pickImportedFont(): Promise<ImportedFont | null>;
  onFontLibraryChanged(listener: () => void): () => void;
  listCursorPacks(): Promise<CursorPackDescriptor[]>;
  pickCursorPackImport(): Promise<CursorPackImportResult | null>;
  onCursorPacksChanged(listener: () => void): () => void;
  openCursorPackDiscovery(): Promise<void>;
  createProject(options?: CreateProjectOptions): Promise<CaptureProject>;
  renameProject(projectId: string, name: string): Promise<CaptureProject>;
  deleteProject(projectId: string): Promise<void>;
  revealProject(projectId: string): Promise<boolean>;
  saveProjectThumbnail(projectId: string, dataUrl: string): Promise<string | null>;
  whisperModels(): Promise<
    Array<{ id: string; status: 'missing' | 'ready'; downloadedBytes: number; totalBytes: number | null }>
  >;
  downloadWhisperModel(
    modelId: string,
  ): Promise<{ id: string; status: 'missing' | 'ready'; downloadedBytes: number; totalBytes: number | null }>;
  deleteWhisperModel(
    modelId: string,
  ): Promise<{ id: string; status: 'missing' | 'ready'; downloadedBytes: number; totalBytes: number | null }>;
  onWhisperProgress(
    listener: (progress: {
      id: string;
      status: 'downloading';
      downloadedBytes: number;
      totalBytes: number | null;
      artifact: string;
    }) => void,
  ): () => void;
  configureCameraOverlay(state: { cameraId: string; shadowSize?: string; cornerRadius?: string }): void;
  setCameraOverlayActive(active: boolean): void;
  resetCameraOverlayPlacement?: () => void;
  getCameraOverlayState(): Promise<{
    cameraId: string;
    shadowSize: string;
    cornerRadius: string;
    placement?: { x: number; y: number; width: number; height: number };
  } | null>;
  onCameraOverlayState(
    listener: (state: { cameraId: string; shadowSize: string; cornerRadius: string }) => void,
  ): () => void;
  onCameraOverlayHover(listener: (hovered: boolean) => void): () => void;
  onCameraShadow(listener: (state: { shadowSize: string; cornerRadius: string }) => void): () => void;
  beginExport(options: {
    projectName: string;
    format: 'webm' | 'mp4';
  }): Promise<{ canceled: true } | { canceled: false; jobId: string }>;
  writeExportChunk(payload: { jobId: string; sequence: number; data: Uint8Array; position: number }): Promise<void>;
  finalizeExport(jobId: string): Promise<{ path: string }>;
  abortExport(jobId: string): Promise<void>;
  openFile(path: string): Promise<void>;
  showItemInFolder(path: string): Promise<void>;
  getUpdateState(): Promise<AppUpdateState>;
  checkForUpdates(): Promise<AppUpdateState>;
  downloadUpdate(): Promise<boolean>;
  quitAndInstallUpdate(): Promise<boolean>;
  openUpdateChangelog(): Promise<void>;
  openDiscordInvite(): Promise<void>;
  openGithubRepository(): Promise<void>;
  getGitHubStars(): Promise<{ stars: number }>;
  openOnboarding(): Promise<void>;
  closeOnboarding(): Promise<void>;
  completeOnboarding(): Promise<void>;
  onUpdateState(listener: (state: AppUpdateState) => void): () => void;
  beginCameraSegment(payload: CameraSegmentStart): Promise<{ jobId: string }>;
  writeCameraSegment(payload: MediaSegmentChunk): Promise<void>;
  finalizeCameraSegment(payload: CameraSegmentFinish): Promise<void>;
  failCamera(payload: { sessionId: string; reason: string }): Promise<void>;
  beginMicrophoneSegment(payload: MicrophoneSegmentStart): Promise<{ jobId: string }>;
  writeMicrophoneSegment(payload: MediaSegmentChunk): Promise<void>;
  finalizeMicrophoneSegment(payload: MicrophoneSegmentFinish): Promise<void>;
  failMicrophone(payload: MicrophoneFailure): Promise<void>;
  beginSystemAudioSegment(payload: SystemAudioSegmentStart): Promise<{ jobId: string }>;
  writeSystemAudioSegment(payload: MediaSegmentChunk): Promise<void>;
  finalizeSystemAudioSegment(payload: SystemAudioSegmentFinish): Promise<void>;
  failSystemAudio(payload: SystemAudioFailure): Promise<void>;
}

export interface AppUpdateState {
  status: 'idle' | 'checking' | 'available' | 'downloading' | 'downloaded' | 'not-available' | 'error' | 'unsupported';
  currentVersion: string;
  availableVersion: string | null;
  percent: number | null;
  message: string | null;
}

export interface InputAccessStatus {
  state: 'available' | 'permission-required' | 'installation-required' | 'unavailable' | 'denied';
  canRequest: boolean;
  clicks: boolean;
  shortcuts: boolean;
  recordsText: false;
  unavailableReason?: 'input-helper-unavailable' | 'polkit-unavailable' | 'input-broker-unavailable';
  mouseDevices?: number;
  keyboardDevices?: number;
}

export interface PreferenceShortcut {
  keys: string;
  scope: 'global' | 'application';
  category: string;
}
export interface PreferenceSettings {
  schemaVersion: 3;
  theme: 'light' | 'dark' | 'system';
  appearance?: AppearanceSettings;
  hudWindow?: { width: number; height: number };
  recordingBar: { visibility: RecordingBarVisibility };
  recordingInteractions: { enabled: boolean; noticeDismissed: boolean };
  voiceover?: { countdownSeconds: 0 | 3 | 5 | 10; monitorProjectAudio: boolean };
  spellCheck?: { enabled: boolean };
  onboardingCompleted?: boolean;
  devices: {
    cameraId?: string;
    micId?: string;
    systemAudioMode?: string;
    [key: string]: unknown;
  };
  shortcuts: Record<string, PreferenceShortcut>;
  backgroundPresets: { colors: string[]; gradients: GradientBackground[] };
  extras: Record<string, unknown>;
}

export type PreferencePatch = Partial<
  Omit<PreferenceSettings, 'recordingInteractions' | 'spellCheck' | 'appearance' | 'voiceover'>
> & {
  recordingInteractions?: Partial<PreferenceSettings['recordingInteractions']>;
  spellCheck?: Partial<PreferenceSettings['spellCheck']>;
  appearance?: Partial<AppearanceSettings>;
  voiceover?: Partial<NonNullable<PreferenceSettings['voiceover']>>;
};

export interface ProjectEditorPresentation {
  canvas: OutputCanvasSettings;
  selectedBackgroundId: string | null;
  background?: BackgroundValue | null;
  blurPercent?: number;
  importedBackgrounds: BackgroundMedia[];
  cursor: CursorPresentationSettings;
}

export interface ProjectEditorState {
  schemaVersion: 3;
  /** Runtime-only marker: true until a newly created project has saved its first editor state. */
  isFresh?: boolean;
  composition: ClipComposition;
  zoom: ProjectZoomState;
  presentation: ProjectEditorPresentation;
}

export interface CameraSegmentStart {
  sessionId: string;
  sourceId: string;
  format: {
    codec: 'vp8';
    width: number;
    height: number;
    nominalFps: number;
    appearance?: { shadowSize: 'none' | 'sm' | 'md' | 'lg'; cornerRadius: 'none' | 'sm' | 'md' | 'lg' | 'full' };
    placement?: { x: number; y: number; width: number; height: number };
  };
  startNs: number;
}
export interface MediaSegmentChunk {
  jobId: string;
  sequence: number;
  data: Uint8Array;
}
export interface CameraSegmentFinish {
  jobId: string;
  endNs: number;
  metrics: Record<string, number>;
}
export interface MicrophoneSegmentStart {
  sessionId: string;
  sourceId: string;
  format: { codec: 'opus'; sampleRate: number; channels: number };
  startNs: number;
}
export interface MicrophoneSegmentFinish {
  jobId: string;
  endNs: number;
  metrics: Record<string, number>;
}
export interface MicrophoneFailure {
  sessionId: string;
  sourceId: string;
  reason: string;
  format?: { codec: 'opus'; sampleRate: number; channels: number };
}
export interface ProjectVoiceoverStart {
  projectId: string;
  sourceId: string;
  format: { codec: 'opus'; sampleRate: number; channels: number };
}
export interface ProjectVoiceoverChunk {
  recordingId: string;
  sequence: number;
  data: Uint8Array;
}
export interface ProjectVoiceoverFinish {
  recordingId: string;
  name?: string;
}
export interface SystemAudioSegmentStart {
  sessionId: string;
  sourceId: string;
  format: { codec: 'opus'; sampleRate: number; channels: number };
  startNs: number;
}
export interface SystemAudioSegmentFinish {
  jobId: string;
  endNs: number;
  metrics: Record<string, number>;
}
export interface SystemAudioFailure {
  sessionId: string;
  sourceId: string;
  reason: string;
  format?: { codec: 'opus'; sampleRate: number; channels: number };
}
export interface CapturePreview {
  id: string;
  name: string;
  thumbnail: string;
  appIcon: string | null;
  displayId?: string;
  displayBounds?: { x: number; y: number; width: number; height: number };
}
export interface CaptureSourcePreviewRequest {
  sourceId: string;
  maxWidth?: number;
  maxHeight?: number;
  refresh?: boolean;
}
export interface CaptureSourcePreview {
  sourceId: string;
  thumbnail: string | null;
  status: 'ready' | 'unavailable';
}
export interface CaptureSource {
  id: string;
  kind: 'display' | 'window' | 'application' | 'system-audio' | 'microphone' | 'camera';
  label: string;
  isDefault: boolean;
  displayId?: string;
  selectionMode?: 'direct' | 'system-picker' | 'portal';
}
export interface RequirementDiagnostic {
  available: boolean;
  errorCode: string | null;
  detail: string | null;
}
export interface PortalDiagnostic extends RequirementDiagnostic {
  version: number | null;
  monitor: boolean | null;
  window: boolean | null;
  metadataCursor: boolean | null;
}
export interface FfmpegDiagnostic extends RequirementDiagnostic {
  encoder: string | null;
  codec: string | null;
  hardware: boolean | null;
}
export interface LinuxCaptureDiagnostics {
  distribution: string | null;
  distributionId: string | null;
  distributionLike?: string[];
  distributionVersion: string | null;
  kernel: string | null;
  architecture: string;
  desktop: string | null;
  sessionType: string;
  displayServer: string;
  backend: string;
  portal: PortalDiagnostic;
  pipewire: RequirementDiagnostic;
  ffmpeg: FfmpegDiagnostic;
  recordingAvailable: boolean;
}
export interface CaptureDiagnostics {
  platform: string;
  linux?: LinuxCaptureDiagnostics;
}
export interface CaptureCatalog {
  sources: CaptureSource[];
  capabilities: Record<string, boolean>;
  diagnostics?: CaptureDiagnostics;
  limitations?: string[];
}
