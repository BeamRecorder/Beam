import PlaybackWorker from './playback/playback.worker?worker';
import { MediaPlaybackEngine } from './playback/media-playback-engine';
import { AudioPlaybackScheduler } from './playback/audio-scheduler';
import type { MediaPlaybackOptions } from './playback/playback-worker-binding-types';

export const browserPlaybackClock = {
  requestFrame: (callback: () => void) => requestAnimationFrame(callback),
  cancelFrame: (id: number) => cancelAnimationFrame(id),
};

export function createBrowserPlaybackEngine(options: Partial<MediaPlaybackOptions> = {}): MediaPlaybackEngine {
  let engine: MediaPlaybackEngine;
  const audio = options.audio ?? new AudioPlaybackScheduler((error) => engine.reportAudioError(error));
  engine = new MediaPlaybackEngine({
    ...options,
    audio,
    workerFactory: options.workerFactory ?? (() => new PlaybackWorker()),
    clock: options.clock ?? browserPlaybackClock,
  });
  return engine;
}
