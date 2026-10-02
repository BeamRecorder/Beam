import type { Input, SourceRef, UrlSource } from 'mediabunny';

export type FileMediaKind = 'audio' | 'video';

export interface MediaSourceDescriptor {
  assetId: string;
  kind: FileMediaKind;
  url: string;
  label: string;
}

export interface MediaVideoMetadata {
  trackId: string;
  codec: string | null;
  codecParameter: string | null;
  codedWidth: number;
  codedHeight: number;
  displayWidth: number;
  displayHeight: number;
  rotation: 0 | 90 | 180 | 270;
  pixelAspectRatio: { numerator: number; denominator: number };
  decoderConfig: VideoDecoderConfig | null;
  canDecode: boolean;
}

export interface MediaAudioMetadata {
  trackId: string;
  codec: string | null;
  codecParameter: string | null;
  numberOfChannels: number;
  sampleRate: number;
  decoderConfig: AudioDecoderConfig | null;
  canDecode: boolean;
}

export interface MediaMetadata {
  container: string;
  mimeType: string;
  durationSeconds: number;
  videoTracks: MediaVideoMetadata[];
  audioTracks: MediaAudioMetadata[];
}

export interface MediaCapabilities {
  hasVideo: boolean;
  hasAudio: boolean;
  canDecodeVideo: boolean;
  canDecodeAudio: boolean;
}

export interface MediaFrame {
  clipId: string;
  bitmap: ImageBitmap;
  timestampSeconds: number;
  durationSeconds: number;
  width: number;
  height: number;
  byteSize: number;
  close(): void;
}

export interface MediaErrorContext {
  operation: 'open-media' | 'inspect-track' | 'configure-decoder' | 'reset-decoder' | 'seek-frame' | 'decode-frame';
  errorName?: string;
  causeMessage?: string;
  clipId?: string;
  timelineSeconds?: number;
  sourceSeconds?: number;
  codec?: string | null;
  codedWidth?: number;
  codedHeight?: number;
  hardwareAcceleration?: HardwareAcceleration;
  optimizeForLatency?: boolean;
}

interface MediaErrorBase {
  sourceId: string;
  message: string;
  context?: MediaErrorContext;
}

export type MediaError =
  | (MediaErrorBase & { kind: 'missing' })
  | (MediaErrorBase & { kind: 'invalid-container' })
  | (MediaErrorBase & { kind: 'empty' })
  | (MediaErrorBase & { kind: 'missing-track'; track: FileMediaKind })
  | (MediaErrorBase & { kind: 'unsupported-codec'; track: FileMediaKind; codec: string | null })
  | (MediaErrorBase & { kind: 'decode-failure'; cause?: unknown })
  | (MediaErrorBase & { kind: 'disposed' });

export interface MediaSourceLease {
  ref: SourceRef<UrlSource>;
  release(): void;
}

export interface OpenedMediaInput {
  descriptor: MediaSourceDescriptor;
  input: Input<UrlSource>;
  dispose(): void;
}

export type MediaInspection = {
  metadata: MediaMetadata;
  capabilities: MediaCapabilities;
};

export type DroppedMediaKind = 'video' | 'image' | 'audio';

export interface DroppedMediaInspection {
  kind: DroppedMediaKind;
  durationMs: number;
  width: number | null;
  height: number | null;
  hasAudio: boolean;
  canDecodeAudio: boolean;
  audioCodec: string | null;
}

export class MediaInputError extends Error {
  readonly detail: MediaError;

  constructor(detail: MediaError) {
    super(detail.message);
    this.name = 'MediaInputError';
    this.detail = detail;
  }
}
