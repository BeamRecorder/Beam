export type NativeAudioSelection = { mode: 'disabled' | 'default' } | { mode: 'device'; id: string };

export type NativeCameraSelection =
  | { mode: 'disabled' }
  | { mode: 'first-available'; width: number; height: number; fps: number }
  | { mode: 'device'; id: string; width: number; height: number; fps: number };

export interface NativeMediaConfig {
  camera: NativeCameraSelection;
  microphone: NativeAudioSelection;
  systemAudio: NativeAudioSelection;
}

export interface NativeMediaDevice {
  id: string;
  name: string;
  default?: boolean;
}

export interface NativeMediaDevices {
  cameras: NativeMediaDevice[];
  microphones: NativeMediaDevice[];
  systemOutputs: NativeMediaDevice[];
  errors: { cameras: string | null; microphones: string | null; systemOutputs: string | null };
}

export interface NativeMediaStatus {
  state: 'idle' | 'armed' | 'recording' | 'completed' | 'failed';
  sessionId?: string | null;
  manifestPath?: string | null;
  completed?: boolean;
  tracks?: NativeMediaTrack[] | null;
  error?: string;
}

export interface NativeMediaTrack {
  trackId: string;
  kind: 'camera' | 'microphone' | 'system-audio';
  sourceId: string | null;
  format:
    | { mediaType: 'video'; codec: string; width: number; height: number; nominalFps: number }
    | { mediaType: 'audio'; sampleFormat: string; sampleRate: number; channels: number };
  segments: { segmentId: string; path: string; startNs: number; endNs: number | null; complete: boolean }[];
  metrics: {
    framesAcquired: number;
    framesEncoded: number;
    framesReceived: number;
    framesDropped: number;
    samplesReceived: number;
    samplesDropped: number;
    interruptions: number;
    configurationChanges: number;
  };
  status: 'preparing' | 'recording' | 'paused' | 'completed' | 'failed' | 'interrupted';
  terminationReason: string | null;
}
