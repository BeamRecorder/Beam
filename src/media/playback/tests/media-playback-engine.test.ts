import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { AudioPlaybackScheduler } from '../audio-scheduler';
import { MediaPlaybackEngine } from '../media-playback-engine';
import type { PlaybackWorkerRequest } from '../playback-types';
import type { AudioClip, ClipComposition } from '../../shared';
import {
  cleanupPlaybackGlobals,
  composition,
  asset,
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

const audioAsset = {
  id: 'audio-1',
  kind: 'audio' as const,
  name: 'Audio audio-1',
  fileName: 'audio-1.wav',
  durationMs: 2_000,
  width: null,
  height: null,
  src: 'https://cdn.example.test/audio-1.wav',
  origin: 'project' as const,
};

const audioClip = (enabled: boolean): AudioClip => ({
  id: 'audio-clip',
  kind: 'audio',
  name: 'Audio clip',
  assetId: audioAsset.id,
  role: 'imported',
  timelineStartMs: 0,
  timelineDurationMs: 2_000,
  sourceInMs: 0,
  sourceDurationMs: 2_000,
  playbackRate: 1,
  enabled,
  order: 1,
  volume: 100,
});

const compositionWithAudio = (enabled: boolean): ClipComposition => {
  const value = composition([videoClip('clip-1')]);
  return {
    ...value,
    assets: [...value.assets, audioAsset],
    clips: [...value.clips, audioClip(enabled)],
  };
};

const loadAt = async (
  engine: MediaPlaybackEngine,
  worker: FakeWorker,
  value: ClipComposition,
  timelineSeconds: number,
) => {
  const pending = engine.loadComposition(value, timelineSeconds);
  const loadRequest = worker.requests.find(
    (request): request is Extract<PlaybackWorkerRequest, { type: 'load' }> => request.type === 'load',
  );
  worker.emit({ type: 'ready', generation: loadRequest!.generation });
  for (let index = 0; index < 4; index += 1) await Promise.resolve();
  const request = latestSeekRequest(worker)!;
  worker.emit({
    type: 'seek-result',
    generation: request.generation,
    requestId: request.requestId,
    result: 'presented',
    latencyMs: 1,
  });
  await pending;
};

describe('MediaPlaybackEngine', () => {
  it('loads, seeks, plays, pauses, and reports timeline time', async () => {
    const worker = new FakeWorker();
    const audio = new FakeAudio();
    const engine = new MediaPlaybackEngine({
      workerFactory: () => worker,
      audio: audio as unknown as AudioPlaybackScheduler,
    });
    const states: string[] = [];
    const times: number[] = [];
    engine.on('state', (state) => states.push(state));
    engine.on('time', (time) => times.push(time));

    await load(engine, worker);
    expect(engine.state).toBe('paused');
    expect(worker.requests.find((request) => request.type === 'load')).toMatchObject({
      type: 'load',
      generation: 2,
      clips: [{ clipId: 'clip-1', assetId: 'asset-1' }],
      previewQuality: 'full',
    });

    await engine.play(0.5);
    expect(audio.play).toHaveBeenCalledWith(0.5, 4);
    expect(worker.requests.at(-1)).toMatchObject({ type: 'play', generation: 4, timelineSeconds: 0.5 });
    expect(engine.state).toBe('playing');
    audio.now = 0.75;
    rafCallbacks.shift()?.(0);
    expect(engine.currentTime).toBe(0.75);
    expect(worker.requests.at(-1)).toMatchObject({ type: 'tick', timelineSeconds: 0.75 });

    engine.pause();
    expect(audio.pause).toHaveBeenCalledWith(0.75);
    expect(engine.state).toBe('paused');
    expect(states).toEqual(['loading', 'paused', 'playing', 'paused']);
    expect(times).toEqual([0, 0.75]);
  });

  it('reloads at the current non-zero time without emitting a transient zero', async () => {
    const worker = new FakeWorker();
    const audio = new FakeAudio();
    const engine = new MediaPlaybackEngine({
      workerFactory: () => worker,
      audio: audio as unknown as AudioPlaybackScheduler,
    });
    const times: number[] = [];
    engine.on('time', (time) => times.push(time));

    await load(engine, worker);
    await engine.play(1.25);
    audio.now = 1.25;
    times.length = 0;

    const reload = engine.loadComposition(composition([videoClip('split-left'), videoClip('split-right')]), 1.25);
    const loadRequest = [...worker.requests]
      .reverse()
      .find((request): request is Extract<PlaybackWorkerRequest, { type: 'load' }> => request.type === 'load')!;
    worker.emit({ type: 'ready', generation: loadRequest.generation });
    for (let index = 0; index < 4; index += 1) await Promise.resolve();
    const reloadSeek = latestSeekRequest(worker)!;
    expect(reloadSeek.timelineSeconds).toBe(1.25);
    worker.emit({
      type: 'seek-result',
      generation: reloadSeek.generation,
      requestId: reloadSeek.requestId,
      result: 'presented',
      latencyMs: 1,
    });
    await reload;

    expect(times).not.toContain(0);
    expect(times).toEqual([1.25]);
    expect(engine.currentTime).toBe(1.25);
    engine.dispose();
  });

  it('retimes unchanged clip topology without reloading assets, audio, or cached frames', async () => {
    const worker = new FakeWorker();
    const audio = new FakeAudio();
    const engine = new MediaPlaybackEngine({
      workerFactory: () => worker,
      audio: audio as unknown as AudioPlaybackScheduler,
    });
    await load(engine, worker);
    const initialGeneration = latestSeekRequest(worker)!.generation;
    const cached = new FakeImageBitmap();
    worker.emit(frameResponse(initialGeneration, 'clip-1', 0.5, cached));
    expect(engine.frameFor('clip-1')).not.toBeNull();
    audio.loadComposition.mockClear();
    worker.requests.length = 0;

    const retimed = composition([videoClip('clip-1', 'asset-1', { timelineStartMs: 500, timelineDurationMs: 1_500 })]);
    const pending = engine.loadComposition(retimed, 0.75);
    await Promise.resolve();
    const request = worker.requests.at(-1) as { type?: string; generation?: number } | undefined;
    const usedRetime = request?.type === 'retime';
    worker.emit({ type: 'ready', generation: request!.generation! });
    for (let index = 0; index < 4; index += 1) await Promise.resolve();
    const seek = latestSeekRequest(worker)!;
    worker.emit({
      type: 'seek-result',
      generation: seek.generation,
      requestId: seek.requestId,
      result: 'presented',
      latencyMs: 1,
    });
    await pending;

    expect(usedRetime).toBe(true);
    expect(worker.requests.filter((entry) => entry.type === 'load')).toHaveLength(0);
    expect(audio.loadComposition).not.toHaveBeenCalled();
    expect(engine.frameFor('clip-1')).not.toBeNull();
    expect(cached.close).not.toHaveBeenCalled();
    engine.dispose();
  });

  it('retimes a video enabled toggle while preserving another clip frame and preloaded assets', async () => {
    const worker = new FakeWorker();
    const audio = new FakeAudio();
    const engine = new MediaPlaybackEngine({
      workerFactory: () => worker,
      audio: audio as unknown as AudioPlaybackScheduler,
    });
    const initial = composition([
      videoClip('clip-1'),
      videoClip('clip-2', 'unused', { enabled: false, timelineStartMs: 500 }),
    ]);
    await load(engine, worker, initial);
    const cached = new FakeImageBitmap();
    worker.emit(frameResponse(latestSeekRequest(worker)!.generation, 'clip-1', 0.5, cached));
    audio.loadComposition.mockClear();
    worker.requests.length = 0;

    const next = composition([videoClip('clip-1'), videoClip('clip-2', 'unused', { timelineStartMs: 500 })]);
    const pending = engine.loadComposition(next, 0.75);
    await Promise.resolve();
    const request = worker.requests.at(-1);
    expect(request?.type).toBe('retime');
    if (!request || request.type !== 'retime') throw new Error('Expected a retime request.');
    expect(worker.requests.filter((entry) => entry.type === 'load')).toHaveLength(0);
    worker.emit({ type: 'ready', generation: request.generation });
    for (let index = 0; index < 4; index += 1) await Promise.resolve();
    const seek = latestSeekRequest(worker)!;
    worker.emit({
      type: 'seek-result',
      generation: seek.generation,
      requestId: seek.requestId,
      result: 'presented',
      latencyMs: 1,
    });
    await pending;

    expect(audio.loadComposition).not.toHaveBeenCalled();
    expect(audio.updateComposition).toHaveBeenCalledOnce();
    expect(engine.frameFor('clip-1')).not.toBeNull();
    expect(cached.close).not.toHaveBeenCalled();
    engine.dispose();
  });

  it('retimes an audio enabled toggle without reloading video or audio decoders', async () => {
    const worker = new FakeWorker();
    const audio = new FakeAudio();
    const engine = new MediaPlaybackEngine({
      workerFactory: () => worker,
      audio: audio as unknown as AudioPlaybackScheduler,
    });
    await load(engine, worker, compositionWithAudio(false));
    audio.loadComposition.mockClear();
    audio.updateComposition.mockClear();
    worker.requests.length = 0;

    const pending = engine.loadComposition(compositionWithAudio(true), 0.75);
    await Promise.resolve();
    const request = worker.requests.at(-1);
    expect(request?.type).toBe('retime');
    if (!request || request.type !== 'retime') throw new Error('Expected a retime request.');
    expect(worker.requests.filter((entry) => entry.type === 'load')).toHaveLength(0);
    worker.emit({ type: 'ready', generation: request.generation });
    for (let index = 0; index < 4; index += 1) await Promise.resolve();
    const seek = latestSeekRequest(worker)!;
    worker.emit({
      type: 'seek-result',
      generation: seek.generation,
      requestId: seek.requestId,
      result: 'presented',
      latencyMs: 1,
    });
    await pending;

    expect(audio.loadComposition).not.toHaveBeenCalled();
    expect(audio.updateComposition).toHaveBeenCalledOnce();
    engine.dispose();
  });

  it('configures preview quality, preserves the current frame until replacement, seeks, and resumes playback', async () => {
    const worker = new FakeWorker();
    const audio = new FakeAudio();
    const engine = new MediaPlaybackEngine({
      workerFactory: () => worker,
      audio: audio as unknown as AudioPlaybackScheduler,
    });
    await load(engine, worker);
    const initialSeek = latestSeekRequest(worker)!;
    const previousFrame = new FakeImageBitmap(1_920, 1_080);
    worker.emit(frameResponse(initialSeek.generation, 'clip-1', 0.5, previousFrame));
    await engine.play(0.5);
    audio.now = 0.75;
    worker.requests.length = 0;

    const pending = engine.setPreviewQuality('quarter');
    const configure = worker.requests.at(-1);
    expect(configure).toMatchObject({ type: 'configure-preview', previewQuality: 'quarter' });
    if (!configure || configure.type !== 'configure-preview') throw new Error('Expected a preview request.');
    expect(engine.frameFor('clip-1')?.bitmap).toBe(previousFrame);
    worker.emit({ type: 'ready', generation: configure.generation });
    for (let index = 0; index < 4; index += 1) await Promise.resolve();

    const seek = [...worker.requests]
      .reverse()
      .find((request): request is Extract<PlaybackWorkerRequest, { type: 'seek' }> => request.type === 'seek');
    expect(seek).toMatchObject({ type: 'seek', timelineSeconds: 0.75, mode: 'seek' });
    expect(engine.frameFor('clip-1')?.bitmap).toBe(previousFrame);
    expect(previousFrame.close).not.toHaveBeenCalled();
    const replacement = new FakeImageBitmap(480, 270);
    worker.emit(frameResponse(seek!.generation, 'clip-1', 0.75, replacement));
    expect(previousFrame.close).toHaveBeenCalledOnce();
    expect(engine.frameFor('clip-1')?.bitmap).toBe(replacement);
    worker.emit({
      type: 'seek-result',
      generation: seek!.generation,
      requestId: seek!.requestId,
      result: 'presented',
      latencyMs: 1,
    });
    await pending;

    expect(audio.pause).toHaveBeenCalledWith(0.75);
    expect(audio.play).toHaveBeenLastCalledWith(0.75, expect.any(Number));
    expect(worker.requests.at(-1)).toMatchObject({ type: 'play', timelineSeconds: 0.75 });
    expect(engine.frameFor('clip-1')?.bitmap).toBe(replacement);
    engine.dispose();
  });

  it('uses a full load when retiming changes clip topology', async () => {
    const worker = new FakeWorker();
    const audio = new FakeAudio();
    const engine = new MediaPlaybackEngine({
      workerFactory: () => worker,
      audio: audio as unknown as AudioPlaybackScheduler,
    });
    await load(engine, worker);
    audio.loadComposition.mockClear();
    worker.requests.length = 0;

    const pending = engine.loadComposition(composition([videoClip('new-clip')]), 0.75);
    await Promise.resolve();
    const request = worker.requests.at(-1) as { type?: string; generation?: number } | undefined;
    expect(request?.type).toBe('load');
    worker.emit({ type: 'ready', generation: request!.generation! });
    for (let index = 0; index < 4; index += 1) await Promise.resolve();
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
    expect(worker.requests.filter((entry) => entry.type === 'load')).toHaveLength(1);
    engine.dispose();
  });

  it('surfaces an audio scheduling failure through the existing error state', async () => {
    const worker = new FakeWorker();
    const audio = new FakeAudio();
    const engine = new MediaPlaybackEngine({
      workerFactory: () => worker,
      audio: audio as unknown as AudioPlaybackScheduler,
    });
    await load(engine, worker);
    const errors: unknown[] = [];
    engine.on('error', (error) => errors.push(error));
    audio.play.mockRejectedValueOnce(new Error('audio scheduling failed'));

    await expect(engine.play(0)).rejects.toThrow('audio scheduling failed');
    expect(engine.state).toBe('error');
    expect(errors).toContainEqual(
      expect.objectContaining({ kind: 'decode-failure', message: 'audio scheduling failed' }),
    );
    engine.dispose();
  });

  it('clamps finite seeks and resolves worker latest-wins results, including superseded seeks', async () => {
    const worker = new FakeWorker();
    const audio = new FakeAudio();
    const engine = new MediaPlaybackEngine({
      workerFactory: () => worker,
      audio: audio as unknown as AudioPlaybackScheduler,
    });
    await load(engine, worker);

    const first = engine.seek(99, 'scrub');
    await Promise.resolve();
    const firstRequest = worker.requests.at(-1) as Extract<PlaybackWorkerRequest, { type: 'seek' }>;
    const second = engine.seek(-4, 'seek');
    await Promise.resolve();
    const secondRequest = worker.requests.at(-1) as Extract<PlaybackWorkerRequest, { type: 'seek' }>;
    expect(firstRequest.timelineSeconds).toBe(2);
    expect(secondRequest.timelineSeconds).toBe(0);

    worker.emit({
      type: 'seek-result',
      generation: firstRequest.generation,
      requestId: firstRequest.requestId,
      result: 'superseded',
      latencyMs: 1,
    });
    worker.emit({
      type: 'seek-result',
      generation: secondRequest.generation,
      requestId: secondRequest.requestId,
      result: 'presented',
      latencyMs: 2,
    });
    await expect(first).resolves.toBe('superseded');
    await expect(second).resolves.toBe('presented');
    await expect(engine.seek(Number.NaN, 'seek')).rejects.toThrow('finite');
  });

  it('accepts a pending scrub frame from an older generation but closes unrelated stale frames', async () => {
    const worker = new FakeWorker();
    const audio = new FakeAudio();
    const engine = new MediaPlaybackEngine({
      workerFactory: () => worker,
      audio: audio as unknown as AudioPlaybackScheduler,
    });
    await load(engine, worker);

    const pending = engine.seek(0.5, 'scrub');
    await Promise.resolve();
    const request = worker.requests.at(-1) as Extract<PlaybackWorkerRequest, { type: 'seek' }>;
    engine.pause();
    const scrubFrame = new FakeImageBitmap(12, 8);
    worker.emit({
      ...frameResponse(request.generation, 'clip-1', 0.5, scrubFrame),
      requestId: request.requestId,
    });
    expect(engine.frameFor('clip-1')?.bitmap).toBe(scrubFrame);

    const staleFrame = new FakeImageBitmap(6, 6);
    worker.emit(frameResponse(request.generation, 'clip-1', 0.25, staleFrame));
    expect(staleFrame.close).toHaveBeenCalledOnce();
    expect(engine.frameFor('clip-1')?.bitmap).toBe(scrubFrame);

    worker.emit({
      type: 'seek-result',
      generation: request.generation,
      requestId: request.requestId,
      result: 'presented',
      latencyMs: 2,
    });
    await expect(pending).resolves.toBe('presented');
    engine.dispose();
  });

  it('keeps frames from two clip ids independent, closes stale frames, and evicts on dispose', async () => {
    const worker = new FakeWorker();
    const audio = new FakeAudio();
    const engine = new MediaPlaybackEngine({
      workerFactory: () => worker,
      audio: audio as unknown as AudioPlaybackScheduler,
    });
    await load(engine, worker, composition([videoClip('clip-1'), videoClip('clip-2')]));
    const first = new FakeImageBitmap(10, 10);
    const second = new FakeImageBitmap(20, 10);
    const stale = new FakeImageBitmap(8, 8);
    worker.emit(frameResponse(3, 'clip-1', 0, first));
    worker.emit(frameResponse(3, 'clip-2', 0, second));
    expect(engine.frameFor('clip-1')?.bitmap).toBe(first);
    expect(engine.frameFor('clip-2')?.bitmap).toBe(second);
    worker.emit(frameResponse(1, 'clip-1', 0.5, stale));
    expect(stale.close).toHaveBeenCalledOnce();
    expect(engine.developmentMetrics.disposedBitmaps).toBe(1);
    engine.dispose();
    expect(first.close).toHaveBeenCalledOnce();
    expect(second.close).toHaveBeenCalledOnce();
    expect(audio.dispose).toHaveBeenCalledOnce();
    expect(worker.terminate).not.toHaveBeenCalled();
    worker.emit({ type: 'disposed', generation: 3 });
    expect(worker.terminate).toHaveBeenCalledOnce();
    expect(engine.state).toBe('disposed');
  });

  it('reuses the previous frame for a contiguous fragment on the same track and asset', async () => {
    const worker = new FakeWorker();
    const audio = new FakeAudio();
    const engine = new MediaPlaybackEngine({
      workerFactory: () => worker,
      audio: audio as unknown as AudioPlaybackScheduler,
    });
    const first = videoClip('first', 'asset-1', {
      trackId: 'video-track',
      timelineStartMs: 0,
      timelineDurationMs: 1_000,
      sourceDurationMs: 1_000,
    });
    const second = videoClip('second', 'asset-1', {
      trackId: 'video-track',
      timelineStartMs: 1_000,
      timelineDurationMs: 1_000,
      sourceDurationMs: 1_000,
    });
    const value = composition([first, second]);
    await loadAt(engine, worker, value, 1.5);

    const previous = new FakeImageBitmap();
    worker.emit(frameResponse(latestSeekRequest(worker)!.generation, first.id, 0.5, previous));

    expect(engine.frameFor(second.id)?.bitmap).toBe(previous);
    engine.dispose();
  });

  it('provides continuity immediately at both VIDEO/HOLD boundaries', async () => {
    const worker = new FakeWorker();
    const audio = new FakeAudio();
    const engine = new MediaPlaybackEngine({
      workerFactory: () => worker,
      audio: audio as unknown as AudioPlaybackScheduler,
    });
    const previous = videoClip('previous', 'asset-1', {
      trackId: 'video-track',
      timelineStartMs: 0,
      timelineDurationMs: 1_000,
      sourceDurationMs: 1_000,
    });
    const hold = videoClip('hold', 'asset-1', {
      trackId: 'video-track',
      timelineStartMs: 1_000,
      timelineDurationMs: 1_000,
      sourceInMs: 1_000,
      sourceDurationMs: 1_000,
      freezeFrameSourceMs: 1_000,
    });
    const following = videoClip('following', 'asset-1', {
      trackId: 'video-track',
      timelineStartMs: 2_000,
      timelineDurationMs: 1_000,
      sourceInMs: 2_000,
      sourceDurationMs: 1_000,
    });
    await loadAt(engine, worker, composition([previous, hold, following]), 1.5);

    const generation = latestSeekRequest(worker)!.generation;
    const previousFrame = new FakeImageBitmap();
    worker.emit(frameResponse(generation, previous.id, 0.99, previousFrame));
    expect(engine.frameFor(hold.id)?.bitmap).toBe(previousFrame);

    const holdFrame = new FakeImageBitmap();
    worker.emit(frameResponse(generation, hold.id, 1, holdFrame));
    const pending = engine.seek(2, 'seek');
    await Promise.resolve();

    // The following fragment can paint from the cached HOLD frame while its
    // worker seek is still pending; no extra decode/presentation latency at
    // either boundary is required.
    expect(engine.frameFor(following.id)?.bitmap).toBe(holdFrame);

    const request = latestSeekRequest(worker)!;
    worker.emit({
      type: 'seek-result',
      generation: request.generation,
      requestId: request.requestId,
      result: 'presented',
      latencyMs: 1,
    });
    await expect(pending).resolves.toBe('presented');
    engine.dispose();
  });

  it('does not reuse a previous frame across a real timeline gap', async () => {
    const worker = new FakeWorker();
    const audio = new FakeAudio();
    const engine = new MediaPlaybackEngine({
      workerFactory: () => worker,
      audio: audio as unknown as AudioPlaybackScheduler,
    });
    const first = videoClip('first', 'asset-1', {
      trackId: 'video-track',
      timelineStartMs: 0,
      timelineDurationMs: 1_000,
      sourceDurationMs: 1_000,
    });
    const second = videoClip('second', 'asset-1', {
      trackId: 'video-track',
      timelineStartMs: 1_500,
      timelineDurationMs: 1_000,
      sourceDurationMs: 1_000,
    });
    await loadAt(engine, worker, composition([first, second]), 1.75);

    const previous = new FakeImageBitmap();
    worker.emit(frameResponse(latestSeekRequest(worker)!.generation, first.id, 0.5, previous));

    expect(engine.frameFor(second.id)).toBeNull();
    engine.dispose();
  });

  it('does not reuse a previous frame when contiguous fragments reference different assets', async () => {
    const worker = new FakeWorker();
    const audio = new FakeAudio();
    const engine = new MediaPlaybackEngine({
      workerFactory: () => worker,
      audio: audio as unknown as AudioPlaybackScheduler,
    });
    const first = videoClip('first', 'asset-1', {
      trackId: 'video-track',
      timelineStartMs: 0,
      timelineDurationMs: 1_000,
      sourceDurationMs: 1_000,
    });
    const second = videoClip('second', 'asset-2', {
      trackId: 'video-track',
      timelineStartMs: 1_000,
      timelineDurationMs: 1_000,
      sourceDurationMs: 1_000,
    });
    const value = composition([first, second]);
    value.assets = [asset('asset-1'), asset('asset-2')];
    await loadAt(engine, worker, value, 1.5);

    const previous = new FakeImageBitmap();
    worker.emit(frameResponse(latestSeekRequest(worker)!.generation, first.id, 0.5, previous));

    expect(engine.frameFor(second.id)).toBeNull();
    engine.dispose();
  });

  it('does not keep a HOLD frame after seeking slightly backward into the previous fragment', async () => {
    const worker = new FakeWorker();
    const audio = new FakeAudio();
    const engine = new MediaPlaybackEngine({
      workerFactory: () => worker,
      audio: audio as unknown as AudioPlaybackScheduler,
    });
    const previous = videoClip('previous', 'asset-1', {
      trackId: 'video-track',
      timelineStartMs: 0,
      timelineDurationMs: 1_000,
      sourceInMs: 0,
      sourceDurationMs: 1_000,
    });
    const hold = videoClip('hold', 'asset-1', {
      trackId: 'video-track',
      timelineStartMs: 1_000,
      timelineDurationMs: 1_000,
      sourceInMs: 1_000,
      sourceDurationMs: 1_000,
      freezeFrameSourceMs: 1_000,
    });
    await loadAt(engine, worker, composition([previous, hold]), 1.25);

    const holdFrame = new FakeImageBitmap();
    worker.emit(frameResponse(latestSeekRequest(worker)!.generation, hold.id, 1, holdFrame));
    expect(engine.frameFor(hold.id)?.bitmap).toBe(holdFrame);

    const backward = engine.seek(0.99, 'seek');
    await Promise.resolve();
    const request = latestSeekRequest(worker)!;
    const previousFrame = new FakeImageBitmap();
    worker.emit(frameResponse(request.generation, previous.id, 0.99, previousFrame));
    worker.emit({
      type: 'seek-result',
      generation: request.generation,
      requestId: request.requestId,
      result: 'presented',
      latencyMs: 1,
    });
    await expect(backward).resolves.toBe('presented');

    expect(engine.frameFor(previous.id)?.bitmap).toBe(previousFrame);
    expect(engine.frameFor(hold.id)).toBeNull();
    engine.dispose();
  });

  it('waits for the worker disposed acknowledgement before terminating', async () => {
    const worker = new FakeWorker();
    const audio = new FakeAudio();
    const engine = new MediaPlaybackEngine({
      workerFactory: () => worker,
      audio: audio as unknown as AudioPlaybackScheduler,
    });

    engine.dispose();
    expect(worker.requests).toContainEqual({ type: 'dispose' });
    expect(worker.terminate).not.toHaveBeenCalled();

    worker.emit({ type: 'disposed', generation: 0 });
    expect(worker.terminate).toHaveBeenCalledOnce();
    engine.dispose();
    expect(worker.terminate).toHaveBeenCalledOnce();
  });

  it('falls back to terminating the worker when the disposed acknowledgement times out', () => {
    vi.useFakeTimers();
    const worker = new FakeWorker();
    const audio = new FakeAudio();
    const engine = new MediaPlaybackEngine({
      workerFactory: () => worker,
      audio: audio as unknown as AudioPlaybackScheduler,
    });

    engine.dispose();
    vi.advanceTimersByTime(1_999);
    expect(worker.terminate).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(worker.terminate).toHaveBeenCalledOnce();
  });

  it('loops when the playback clock reaches composition end', async () => {
    const worker = new FakeWorker();
    const audio = new FakeAudio();
    const engine = new MediaPlaybackEngine({
      workerFactory: () => worker,
      audio: audio as unknown as AudioPlaybackScheduler,
    });
    await load(engine, worker);
    await engine.play(1.9);
    audio.now = 2;
    rafCallbacks.shift()?.(0);
    await Promise.resolve();
    const loopSeek = worker.requests.at(-1) as Extract<PlaybackWorkerRequest, { type: 'seek' }>;
    expect(loopSeek).toMatchObject({ type: 'seek', timelineSeconds: 0, mode: 'seek' });
    worker.emit({
      type: 'seek-result',
      generation: loopSeek.generation,
      requestId: loopSeek.requestId,
      result: 'presented',
      latencyMs: 3,
    });
  });

  it('fails safely for invalid worker responses and worker errors', async () => {
    const worker = new FakeWorker();
    const audio = new FakeAudio();
    const engine = new MediaPlaybackEngine({
      workerFactory: () => worker,
      audio: audio as unknown as AudioPlaybackScheduler,
    });
    const errors: unknown[] = [];
    engine.on('error', (error) => errors.push(error));
    worker.emit({ type: 'not-a-response' });
    expect(engine.state).toBe('error');
    expect(errors[0]).toMatchObject({ kind: 'decode-failure', sourceId: 'playback-worker' });
    worker.onerror?.({} as ErrorEvent);
    expect(errors).toHaveLength(2);
  });

  it('ignores stale metrics and errors but fails on an error from the current generation', async () => {
    const worker = new FakeWorker();
    const audio = new FakeAudio();
    const engine = new MediaPlaybackEngine({
      workerFactory: () => worker,
      audio: audio as unknown as AudioPlaybackScheduler,
    });
    await load(engine, worker);
    const currentSeek = worker.requests.at(-1) as Extract<PlaybackWorkerRequest, { type: 'seek' }>;
    const staleMetrics = {
      decodedFrames: 99,
      presentedFrames: 98,
      droppedFrames: 97,
      supersededRequests: 96,
      queueSize: 95,
      cacheBytes: 94,
      disposedBitmaps: 93,
      seekLatencyMs: [92],
    };
    worker.emit({ type: 'metrics', generation: currentSeek.generation - 1, metrics: staleMetrics });
    worker.emit({
      type: 'error',
      generation: currentSeek.generation - 1,
      error: { kind: 'decode-failure', sourceId: 'stale', message: 'stale failure' },
    });
    expect(engine.state).toBe('paused');
    expect(engine.developmentMetrics).toMatchObject({ decodedFrames: 0, presentedFrames: 0, droppedFrames: 0 });

    worker.emit({
      type: 'error',
      generation: currentSeek.generation,
      error: { kind: 'decode-failure', sourceId: 'current', message: 'current failure' },
    });
    expect(engine.state).toBe('error');
  });

  it('emits audio metrics alongside current-generation worker metrics', async () => {
    const worker = new FakeWorker();
    const audio = new FakeAudio();
    const audioMetrics = {
      schedulePasses: 4,
      scheduledBuffers: 12,
      lateBuffers: 2,
      scheduleErrors: 0,
      maxLatenessMs: 38,
      contextState: 'running' as const,
    };
    (audio as unknown as { performanceMetrics: typeof audioMetrics }).performanceMetrics = audioMetrics;
    const engine = new MediaPlaybackEngine({
      workerFactory: () => worker,
      audio: audio as unknown as AudioPlaybackScheduler,
    });
    const received: unknown[] = [];
    engine.on('audio-metrics', (value) => received.push(value));

    await load(engine, worker);
    const currentSeek = worker.requests.at(-1) as Extract<PlaybackWorkerRequest, { type: 'seek' }>;
    worker.emit({
      type: 'metrics',
      generation: currentSeek.generation,
      metrics: {
        decodedFrames: 3,
        presentedFrames: 3,
        droppedFrames: 0,
        supersededRequests: 0,
        queueSize: 1,
        cacheBytes: 64,
        disposedBitmaps: 0,
        seekLatencyMs: [4],
      },
    });

    expect(received).toEqual([audioMetrics]);
    engine.dispose();
  });

  it('closes a bitmap carried by an invalid worker response', async () => {
    const worker = new FakeWorker();
    const audio = new FakeAudio();
    const engine = new MediaPlaybackEngine({
      workerFactory: () => worker,
      audio: audio as unknown as AudioPlaybackScheduler,
    });
    await load(engine, worker);
    const currentSeek = worker.requests.at(-1) as Extract<PlaybackWorkerRequest, { type: 'seek' }>;
    const bitmap = new FakeImageBitmap();
    worker.emit({
      type: 'frame',
      generation: currentSeek.generation,
      clipId: 'clip-1',
      assetId: 'asset-1',
      bitmap,
      timestampSeconds: 0,
      durationSeconds: Number.NaN,
    });
    expect(bitmap.close).toHaveBeenCalledOnce();
    expect(engine.state).toBe('error');
  });

  it('resolves a pending seek as superseded when the worker reports a seek error', async () => {
    const worker = new FakeWorker();
    const audio = new FakeAudio();
    const engine = new MediaPlaybackEngine({
      workerFactory: () => worker,
      audio: audio as unknown as AudioPlaybackScheduler,
    });
    await load(engine, worker);
    const pending = engine.seek(0.5, 'seek');
    await Promise.resolve();
    const request = worker.requests.at(-1) as Extract<PlaybackWorkerRequest, { type: 'seek' }>;
    worker.emit({
      type: 'error',
      generation: request.generation,
      requestId: request.requestId,
      error: { kind: 'decode-failure', sourceId: 'asset-1', message: 'seek failed' },
    });
    await expect(pending).resolves.toBe('superseded');
    expect(engine.state).toBe('error');
  });

  it('resolves an older pending load when a newer composition supersedes it', async () => {
    const worker = new FakeWorker();
    const audio = new FakeAudio();
    const engine = new MediaPlaybackEngine({
      workerFactory: () => worker,
      audio: audio as unknown as AudioPlaybackScheduler,
    });
    const first = engine.loadComposition(composition([videoClip('first')]));
    for (let index = 0; index < 5; index += 1) await Promise.resolve();
    const firstLoad = worker.requests.find(
      (request): request is Extract<PlaybackWorkerRequest, { type: 'load' }> => request.type === 'load',
    );
    expect(firstLoad).toBeDefined();

    const second = engine.loadComposition(composition([videoClip('second')]));
    for (let index = 0; index < 5; index += 1) await Promise.resolve();
    const secondLoad = [...worker.requests]
      .reverse()
      .find((request): request is Extract<PlaybackWorkerRequest, { type: 'load' }> => request.type === 'load');
    expect(secondLoad).toBeDefined();
    expect(secondLoad!.generation).toBeGreaterThan(firstLoad!.generation);
    worker.emit({ type: 'ready', generation: secondLoad!.generation });
    for (let index = 0; index < 5; index += 1) await Promise.resolve();
    const secondSeek = [...worker.requests]
      .reverse()
      .find((request): request is Extract<PlaybackWorkerRequest, { type: 'seek' }> => request.type === 'seek');
    expect(secondSeek).toBeDefined();
    worker.emit({
      type: 'seek-result',
      generation: secondSeek!.generation,
      requestId: secondSeek!.requestId,
      result: 'presented',
      latencyMs: 1,
    });

    await expect(first).resolves.toBeUndefined();
    await expect(second).resolves.toBeUndefined();
    expect(engine.state).toBe('paused');
    engine.dispose();
  });
});
