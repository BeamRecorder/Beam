export interface VideoEncodingDiagnostics {
  backend: string;
  codec: string;
  /** Requested mode, without claiming an actual hardware encoder was selected. */
  requestedMode: string | null;
  width: number;
  height: number;
  fps: number;
  bitrateBps: number;
  queueCapacity: number;
  initializationMs: number | null;
  initializationError: string | null;
  attempts: Array<{ requestedMode: string; elapsedMs: number; error: string | null }>;
  finalization: { elapsedMs: number; timeoutMs: number; success: boolean; error: string | null } | null;
}

export interface RecordingDiagnostics {
  /** Machine state at inspection, independently of the recording's saved platform. */
  sampledAt: string;
  environment: {
    beamVersion: string;
    electronVersion: string | null;
    chromiumVersion: string | null;
    platform: string;
    osRelease: string;
    architecture: string;
    cpuModel: string | null;
    logicalCpuCount: number;
    totalMemoryBytes: number;
    availableMemoryBytes: number;
  };
  assets: Array<{
    trackId: string;
    path: string;
    errorCode?: string;
    sizeBytes?: number;
    modifiedAt?: string;
    /** Structural headers only; this does not assert a decodable video track. */
    mp4?: {
      status: 'headers-read' | 'inspection-limit' | 'invalid-size' | 'truncated-header' | 'truncated-box';
      boxes: Array<{ type: string; offset: number; size: number }>;
    };
  }>;
}
