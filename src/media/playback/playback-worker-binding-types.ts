import type { MediaError } from '../shared';
import type { PlaybackSeekResult } from './playback-types';
import type { AudioPlaybackScheduler } from './audio-scheduler';
import type { PreviewQuality } from './playback-preview';

export interface MediaPlaybackOptions {
  workerFactory?: () => PlaybackWorkerLike;
  audio?: AudioPlaybackScheduler;
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
