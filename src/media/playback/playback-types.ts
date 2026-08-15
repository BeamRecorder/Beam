import type { MediaError, MediaSourceDescriptor } from '../shared';

export type PlaybackSeekMode = 'seek' | 'scrub';
export type PlaybackSeekResult = 'presented' | 'superseded';
export type PlaybackState = 'idle' | 'loading' | 'paused' | 'playing' | 'error' | 'disposed';

export interface PlaybackClipDescriptor {
  clipId: string;
  assetId: string;
  timelineStartSeconds: number;
  timelineDurationSeconds: number;
  sourceInSeconds: number;
  playbackRate: number;
}

export type PlaybackWorkerRequest =
  | {
      type: 'load';
      generation: number;
      assets: MediaSourceDescriptor[];
      clips: PlaybackClipDescriptor[];
    }
  | { type: 'play'; generation: number; timelineSeconds: number }
  | { type: 'tick'; generation: number; timelineSeconds: number }
  | { type: 'pause'; generation: number }
  | {
      type: 'seek';
      generation: number;
      requestId: number;
      timelineSeconds: number;
      mode: PlaybackSeekMode;
    }
  | { type: 'dispose' };

export interface PlaybackFrameMessage {
  type: 'frame';
  generation: number;
  requestId?: number;
  clipId: string;
  assetId: string;
  bitmap: ImageBitmap;
  timestampSeconds: number;
  durationSeconds: number;
}

export interface PlaybackMetrics {
  decodedFrames: number;
  presentedFrames: number;
  droppedFrames: number;
  supersededRequests: number;
  queueSize: number;
  cacheBytes: number;
  disposedBitmaps: number;
  seekLatencyMs: number[];
}

export type PlaybackWorkerResponse =
  | { type: 'ready'; generation: number }
  | { type: 'disposed'; generation: number }
  | PlaybackFrameMessage
  | { type: 'seek-result'; generation: number; requestId: number; result: PlaybackSeekResult; latencyMs: number }
  | { type: 'metrics'; generation: number; metrics: PlaybackMetrics }
  | { type: 'error'; generation: number; error: MediaError; requestId?: number };

export type PlaybackEventMap = {
  time: number;
  frame: { clipId: string };
  state: PlaybackState;
  error: MediaError;
  metrics: PlaybackMetrics;
};
