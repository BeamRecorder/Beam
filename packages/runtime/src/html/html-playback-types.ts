import type { MediaPlaybackEngine } from '../playback/media-playback-engine';

export interface HtmlPlaybackAdapter {
  seek(timeMs: number): void | Promise<void>;
  failed(error: unknown): void;
}

export interface HtmlPlaybackController {
  readonly state: 'waiting' | 'ready' | 'failed' | 'disposed';
  seek(timeMs: number): void;
  start(): Promise<void>;
  dispose(): void;
}

export interface HtmlPlaybackClock {
  currentTime(): number;
  subscribe(listener: (seconds: number) => void): () => void;
}

export type HtmlClockEngine = Pick<MediaPlaybackEngine, 'currentTime' | 'on'>;
