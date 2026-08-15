export interface ExportRuntimeDiagnostics {
  elapsedMs: number;
  phase: 'validating_assets' | 'loading_assets' | 'encoding' | 'finalizing';
  validationMs: number | null;
  assetLoadingMs: number | null;
  outputSetupMs: number | null;
  videoPipelineMs: number | null;
  audioPipelineMs: number | null;
  muxFinalizationMs: number | null;
  nativeFinalizationMs: number | null;
  decodeMs: number;
  renderMs: number;
  encoderBackpressureMs: number;
  ipcWriteWaitMs: number;
  encodedFps: number | null;
  audioRealtimeSpeed: number | null;
  chunkCount: number;
  bytesWritten: number;
  videoCodec: string | null;
  audioCodec: string | null;
  inputVideoCodecs: string[];
  inputAudioCodecs: string[];
}

export interface ExportEnvironmentDiagnostics {
  appVersion: string | null;
  platform: string;
  navigatorPlatform: string;
  userAgent: string;
  language: string;
  timezone: string;
  hardwareConcurrency: number | null;
  deviceMemoryGb: number | null;
  screen: string;
  viewport: string;
  devicePixelRatio: number;
  webgpuAvailable: boolean;
  webglRenderer: string | null;
  offscreenCanvas: boolean;
  videoEncoder: boolean;
  videoDecoder: boolean;
  audioEncoder: boolean;
  audioDecoder: boolean;
  hardwareAcceleration: null;
}

export interface ExportDiagnostics {
  schemaVersion: 1;
  startedAt: string;
  completedAt: string | null;
  destinationDialogMs: number;
  environment: ExportEnvironmentDiagnostics;
  runtime: ExportRuntimeDiagnostics | null;
}
