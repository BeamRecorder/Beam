import type { AudioPlaybackMetrics } from './audio-playback-metrics';
import type { MediaError } from '@beam/runtime/shared/index';
import type { PlaybackSeekResult } from '@beam/runtime/playback/playback-types';
import type { ClipComposition } from '@beam/engine/shared/composition-types';
import type { PreviewQuality } from '@beam/runtime/playback/playback-preview';

export interface MediaPlaybackOptions {
  workerFactory: () => PlaybackWorkerLike;
  audio: PlaybackAudioService;
  clock: PlaybackClock;
  previewQuality?: PreviewQuality;
}

export type PlaybackWorkerLike = Pick<Worker, 'postMessage' | 'terminate' | 'onmessage' | 'onerror'>;
export interface PlaybackWorkerBinding {
  receive(data: unknown): void;
  disposed(): boolean;
  terminate(): void;
  loads: Map<number, { reject(error: Error): void }>;
  seeks: Map<number, { resolve(result: PlaybackSeekResult): void }>;
  fail(error: MediaError): void;
}

export interface PlaybackClock {
  requestFrame(callback: () => void): number;
  cancelFrame(id: number): void;
}
export interface PlaybackAudioService {
  loadComposition(composition: ClipComposition): Promise<MediaError[]>;
  updateComposition(composition: ClipComposition): void;
  play(time: number, generation: number): Promise<void>;
  pause(time?: number): void;
  seek(time: number, generation: number, resume: boolean): Promise<void>;
  readonly performanceMetrics: AudioPlaybackMetrics;
  currentTime(): number;
  setVolume(volume: number): void;
  dispose(): void;
}
