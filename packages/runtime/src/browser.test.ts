// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { MediaError } from './shared/media-types';
import type { PlaybackAudioService } from './playback/playback-worker-binding-types';
import { FakeAudio, FakeWorker, load } from './playback/tests/media-playback-engine.fixtures';
import { createBrowserPlaybackEngine, browserPlaybackClock } from './browser';

const defaults = vi.hoisted(() => ({ report: null as ((error: MediaError) => void) | null, count: 0 }));
vi.mock('./playback/audio-scheduler', async () => {
  const { FakeAudio } = await import('./playback/tests/media-playback-engine.fixtures');
  return {
    AudioPlaybackScheduler: class extends FakeAudio {
      constructor(report: (error: MediaError) => void) {
        super();
        defaults.report = report;
        defaults.count += 1;
      }
    },
  };
});
let worker: FakeWorker;
beforeEach(() => {
  defaults.report = null;
  defaults.count = 0;
  vi.stubGlobal(
    'Worker',
    class extends FakeWorker {
      constructor() {
        super();
        worker = this;
      }
    },
  );
  vi.stubGlobal(
    'requestAnimationFrame',
    vi.fn(() => 9),
  );
  vi.stubGlobal('cancelAnimationFrame', vi.fn());
});
afterEach(() => vi.unstubAllGlobals());
const dispose = (engine: ReturnType<typeof createBrowserPlaybackEngine>, backend: FakeWorker) => {
  engine.dispose();
  backend.emit({ type: 'disposed', generation: 0 });
};

describe('explicit browser playback backend', () => {
  it('uses supplied audio, worker and clock services throughout playback and disposal', async () => {
    const backend = new FakeWorker();
    const audio = new FakeAudio();
    const clock = { requestFrame: vi.fn(() => 17), cancelFrame: vi.fn() };
    const engine = createBrowserPlaybackEngine({
      workerFactory: () => backend,
      clock,
      audio: audio as unknown as PlaybackAudioService,
    });
    await load(engine, backend);
    await engine.play(0);
    engine.pause();
    expect(clock.requestFrame).toHaveBeenCalledOnce();
    expect(clock.cancelFrame).toHaveBeenCalledWith(17);
    expect(defaults.count).toBe(0);
    expect(globalThis.requestAnimationFrame).not.toHaveBeenCalled();
    dispose(engine, backend);
    expect(audio.dispose).toHaveBeenCalledOnce();
    expect(backend.terminate).toHaveBeenCalledOnce();
  });
  it('constructs the browser backend explicitly and delegates frame scheduling to the host', () => {
    const engine = createBrowserPlaybackEngine();
    expect(defaults.count).toBe(1);
    expect(engine.state).toBe('idle');
    const callback = vi.fn();
    expect(browserPlaybackClock.requestFrame(callback)).toBe(9);
    browserPlaybackClock.cancelFrame(9);
    expect(globalThis.requestAnimationFrame).toHaveBeenCalledWith(callback);
    expect(globalThis.cancelAnimationFrame).toHaveBeenCalledWith(9);
    dispose(engine, worker);
  });
  it('forwards asynchronous audio backend errors through engine events', () => {
    const engine = createBrowserPlaybackEngine();
    const listener = vi.fn();
    engine.on('error', listener);
    const error: MediaError = { kind: 'decode-failure', sourceId: 'audio', message: 'Audio failed' };
    defaults.report!(error);
    expect(listener).toHaveBeenCalledWith(error);
    dispose(engine, worker);
  });
});
