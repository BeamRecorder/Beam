import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { AudioPlaybackScheduler } from '../audio-scheduler';
import { MediaPlaybackEngine } from '../media-playback-engine';
import type { PlaybackWorkerRequest } from '../playback-types';
import type { AudioClip, ClipComposition } from '../../shared';
import {
  cleanupPlaybackGlobals,
  composition,
  FakeAudio,
  FakeImageBitmap,
  FakeWorker,
  frameResponse,
  latestSeekRequest,
  load,
  rafCallbacks,
  resetPlaybackGlobals,
  videoClip,
} from './media-playback-engine.fixtures';

vi.mock('../playback.worker?worker', () => ({ default: class PlaybackWorker {} }));

beforeEach(resetPlaybackGlobals);
afterEach(cleanupPlaybackGlobals);

function createEngine(
  worker = new FakeWorker(),
  audio = new FakeAudio(),
  previewQuality?: 'full' | 'half' | 'quarter',
) {
  const engine = new MediaPlaybackEngine({
    workerFactory: () => worker,
    audio: audio as unknown as AudioPlaybackScheduler,
    ...(previewQuality ? { previewQuality } : {}),
  });
  return { engine, worker, audio };
}

function acknowledgeDisposal(engine: MediaPlaybackEngine, worker: FakeWorker) {
  engine.dispose();
  worker.emit({ type: 'disposed', generation: 0 });
}

function deferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

async function flushPromises() {
  for (let index = 0; index < 6; index += 1) await Promise.resolve();
}

describe('MediaPlaybackEngine lifecycle', () => {
  it('validates preview quality, supports an idle quality choice, and exposes volume and listener cleanup', async () => {
    const worker = new FakeWorker();
    const audio = new FakeAudio();
    expect(
      () =>
        new MediaPlaybackEngine({
          workerFactory: () => worker,
          audio: audio as unknown as AudioPlaybackScheduler,
          previewQuality: 'unknown' as never,
        }),
    ).toThrowError(RangeError);

    const { engine } = createEngine(worker, audio);
    await expect(engine.setPreviewQuality('unknown' as never)).rejects.toThrow('Invalid playback preview quality.');
    await engine.setPreviewQuality('full');
    await engine.setPreviewQuality('half');
    await engine.setPreviewQuality('half');
    expect(worker.requests.some((request) => request.type === 'configure-preview')).toBe(false);

    const firstListener = vi.fn();
    const remainingListener = vi.fn();
    const unsubscribe = engine.on('time', firstListener);
    engine.on('time', remainingListener);
    engine.setVolume(37);
    expect(audio.setVolume).toHaveBeenCalledWith(37);

    await load(engine, worker);
    const loadRequest = worker.requests.find((request) => request.type === 'load');
    expect(loadRequest).toMatchObject({ previewQuality: 'half' });
    expect(firstListener).toHaveBeenCalledOnce();
    expect(remainingListener).toHaveBeenCalledOnce();
    unsubscribe();

    const pending = engine.seek(0.5, 'scrub');
    await flushPromises();
    const request = latestSeekRequest(worker)!;
    worker.emit({
      type: 'seek-result',
      generation: request.generation,
      requestId: request.requestId,
      result: 'presented',
      latencyMs: 1,
    });
    await expect(pending).resolves.toBe('presented');
    expect(firstListener).toHaveBeenCalledOnce();
    expect(remainingListener).toHaveBeenCalledTimes(2);
    acknowledgeDisposal(engine, worker);
  });

  it('ignores late audio play and seek completions after a newer pause', async () => {
    const { engine, worker, audio } = createEngine();
    await load(engine, worker);

    const playGate = deferred<undefined>();
    audio.play.mockReturnValueOnce(playGate.promise);
    const stalePlay = engine.play(0.5);
    engine.pause();
    playGate.resolve(undefined);
    await expect(stalePlay).resolves.toBeUndefined();
    expect(engine.state).toBe('paused');
    expect(worker.requests.some((request) => request.type === 'play')).toBe(false);

    const rejectedPlayGate = deferred<undefined>();
    audio.play.mockReturnValueOnce(rejectedPlayGate.promise);
    const rejectedStalePlay = engine.play(0.75);
    engine.pause();
    rejectedPlayGate.reject(new Error('late audio play failure'));
    await expect(rejectedStalePlay).rejects.toThrow('late audio play failure');
    expect(engine.state).toBe('paused');

    const seekCount = worker.requests.filter((request) => request.type === 'seek').length;
    const seekGate = deferred<undefined>();
    audio.seek.mockReturnValueOnce(seekGate.promise);
    const staleSeek = engine.seek(0.5, 'seek');
    engine.pause();
    seekGate.resolve(undefined);
    await expect(staleSeek).resolves.toBe('superseded');
    expect(worker.requests.filter((request) => request.type === 'seek')).toHaveLength(seekCount);
    expect(engine.state).toBe('paused');
    acknowledgeDisposal(engine, worker);
  });

  it('does not tick from an animation callback that runs after pause', async () => {
    const { engine, worker } = createEngine();
    await load(engine, worker);
    const onTime = vi.fn();
    engine.on('time', onTime);
    await engine.play(0.5);
    const callback = rafCallbacks.shift();
    expect(callback).toBeDefined();
    engine.pause();
    const tickCount = worker.requests.filter((request) => request.type === 'tick').length;
    onTime.mockClear();

    callback?.(0);

    expect(worker.requests.filter((request) => request.type === 'tick')).toHaveLength(tickCount);
    expect(onTime).not.toHaveBeenCalled();
    acknowledgeDisposal(engine, worker);
  });

  it('rejects pending loads on dispose and closes late frames without handling late errors', async () => {
    const { engine, worker, audio } = createEngine();
    const pendingLoad = engine.loadComposition(composition([videoClip('clip-1')]));
    const rejectedLoad = expect(pendingLoad).rejects.toThrow('Playback engine disposed.');
    await flushPromises();
    const request = worker.requests.find(
      (entry): entry is Extract<PlaybackWorkerRequest, { type: 'load' }> => entry.type === 'load',
    )!;

    engine.dispose();
    await rejectedLoad;
    const lateBitmap = new FakeImageBitmap();
    worker.emit(frameResponse(request.generation, 'clip-1', 0.5, lateBitmap));
    worker.emit({
      type: 'error',
      generation: request.generation,
      error: { kind: 'decode-failure', sourceId: 'late', message: 'late worker error' },
    });
    worker.onerror?.({} as ErrorEvent);
    worker.emit({ type: 'disposed', generation: request.generation });

    expect(audio.dispose).toHaveBeenCalledOnce();
    expect(lateBitmap.close).toHaveBeenCalledOnce();
    expect(engine.state).toBe('disposed');
    expect(worker.terminate).toHaveBeenCalledOnce();
  });

  it('supersedes a pending seek on dispose and closes its late frame', async () => {
    const { engine, worker } = createEngine();
    await load(engine, worker);
    const pendingSeek = engine.seek(0.5, 'scrub');
    await flushPromises();
    const request = latestSeekRequest(worker)!;
    engine.dispose();

    await expect(pendingSeek).resolves.toBe('superseded');
    const lateBitmap = new FakeImageBitmap();
    worker.emit({ ...frameResponse(request.generation, 'clip-1', 0.5, lateBitmap), requestId: request.requestId });

    expect(lateBitmap.close).toHaveBeenCalledOnce();
    expect(engine.state).toBe('disposed');
    worker.emit({ type: 'disposed', generation: request.generation });
  });

  it('invalidates a current frame key when cache pressure evicts its bitmap', async () => {
    const { engine, worker } = createEngine();
    await load(engine, worker, composition([videoClip('large'), videoClip('small', 'unused')]));
    const generation = latestSeekRequest(worker)!.generation;
    const largeBitmap = new FakeImageBitmap(4_096, 4_096);
    worker.emit(frameResponse(generation, 'large', 0, largeBitmap));
    const smallBitmap = new FakeImageBitmap(1, 1);
    worker.emit(frameResponse(generation, 'small', 0, smallBitmap));

    expect(largeBitmap.close).toHaveBeenCalledOnce();
    expect(engine.frameFor('large')).toBeNull();
    expect(engine.frameFor('small')?.bitmap).toBe(smallBitmap);
    acknowledgeDisposal(engine, worker);
  });

  it('reloads the audio scheduler when retiming changes audio topology', async () => {
    const { engine, worker, audio } = createEngine();
    await load(engine, worker);
    audio.loadComposition.mockClear();
    const audioAsset = {
      id: 'audio-asset',
      kind: 'audio' as const,
      name: 'Audio',
      fileName: 'audio.wav',
      durationMs: 2_000,
      width: null,
      height: null,
      src: 'https://cdn.example.test/audio.wav',
      origin: 'project' as const,
    };
    const audioClip: AudioClip = {
      id: 'audio-clip',
      kind: 'audio',
      name: 'Audio clip',
      assetId: audioAsset.id,
      role: 'imported',
      timelineStartMs: 0,
      timelineDurationMs: 1_000,
      sourceInMs: 0,
      sourceDurationMs: 1_000,
      playbackRate: 1,
      enabled: true,
      order: 1,
      volume: 100,
    };
    const next: ClipComposition = {
      ...composition(),
      assets: [...composition().assets, audioAsset],
      clips: [...composition().clips, audioClip],
    };

    const pending = engine.loadComposition(next, 0.5);
    await flushPromises();
    const retime = worker.requests.at(-1);
    expect(retime).toMatchObject({ type: 'retime' });
    if (!retime || retime.type !== 'retime') throw new Error('Expected retime request.');
    worker.emit({ type: 'ready', generation: retime.generation });
    await flushPromises();
    const seek = latestSeekRequest(worker)!;
    worker.emit({
      type: 'seek-result',
      generation: seek.generation,
      requestId: seek.requestId,
      result: 'presented',
      latencyMs: 1,
    });
    await pending;

    expect(audio.loadComposition).toHaveBeenCalledOnce();
    expect(audio.loadComposition).toHaveBeenCalledWith(next);
    acknowledgeDisposal(engine, worker);
  });
});
