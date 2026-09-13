import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { AudioPlaybackScheduler } from '../audio-scheduler';
import { MediaPlaybackEngine } from '../media-playback-engine';
import {
  cleanupPlaybackGlobals,
  composition,
  FakeAudio,
  FakeImageBitmap,
  FakeWorker,
  frameResponse,
  latestSeekRequest,
  load,
  resetPlaybackGlobals,
  videoClip,
} from './media-playback-engine.fixtures';

vi.mock('../playback.worker?worker', () => ({ default: class PlaybackWorker {} }));

beforeEach(resetPlaybackGlobals);
afterEach(cleanupPlaybackGlobals);

async function flushPromises() {
  for (let index = 0; index < 6; index += 1) await Promise.resolve();
}

function cacheFrame(
  worker: FakeWorker,
  generation: number,
  clipId: string,
  timestampSeconds: number,
  durationSeconds = 0.04,
) {
  const bitmap = new FakeImageBitmap();
  worker.emit({
    ...frameResponse(generation, clipId, timestampSeconds, bitmap),
    durationSeconds,
  });
  return bitmap;
}

describe('MediaPlaybackEngine cached scrubbing', () => {
  it('presents a paused scrub from exact cached coverage without audio or worker decoding', async () => {
    const worker = new FakeWorker();
    const audio = new FakeAudio();
    const engine = new MediaPlaybackEngine({
      workerFactory: () => worker,
      audio: audio as unknown as AudioPlaybackScheduler,
    });
    await load(engine, worker);
    const generation = latestSeekRequest(worker)!.generation;
    const bitmap = cacheFrame(worker, generation, 'clip-1', 0.5);
    const seekCount = worker.requests.filter((request) => request.type === 'seek').length;
    audio.seek.mockClear();

    await expect(engine.seek(0.5, 'scrub')).resolves.toBe('presented');

    expect(worker.requests.filter((request) => request.type === 'seek')).toHaveLength(seekCount);
    expect(worker.requests.filter((request) => request.type === 'cancel-seek')).toEqual([
      { type: 'cancel-seek', generation: generation + 1 },
    ]);
    expect(audio.seek).not.toHaveBeenCalled();
    expect(engine.currentTime).toBe(0.5);
    expect(engine.frameFor('clip-1')?.bitmap).toBe(bitmap);
    engine.dispose();
  });

  it('requires cached coverage for each active video layer and ignores static image layers', async () => {
    const worker = new FakeWorker();
    const audio = new FakeAudio();
    const still = { ...videoClip('still', 'unused'), kind: 'image' as const };
    const value = composition([videoClip('base'), videoClip('overlay', 'unused', { timelineStartMs: 200 })]);
    value.clips.push(still);
    const engine = new MediaPlaybackEngine({
      workerFactory: () => worker,
      audio: audio as unknown as AudioPlaybackScheduler,
    });
    await load(engine, worker, value);
    const generation = latestSeekRequest(worker)!.generation;
    const base = cacheFrame(worker, generation, 'base', 0.49);
    const overlay = cacheFrame(worker, generation, 'overlay', 0.29);
    const seekCount = worker.requests.filter((request) => request.type === 'seek').length;

    await expect(engine.seek(0.5, 'scrub')).resolves.toBe('presented');

    expect(worker.requests.filter((request) => request.type === 'seek')).toHaveLength(seekCount);
    expect(engine.frameFor('base')?.bitmap).toBe(base);
    expect(engine.frameFor('overlay')?.bitmap).toBe(overlay);
    expect(worker.requests.some((request) => request.type === 'cancel-seek')).toBe(true);
    engine.dispose();
  });

  it('uses the worker when even one active video layer is not covered', async () => {
    const worker = new FakeWorker();
    const audio = new FakeAudio();
    const engine = new MediaPlaybackEngine({
      workerFactory: () => worker,
      audio: audio as unknown as AudioPlaybackScheduler,
    });
    await load(engine, worker, composition([videoClip('first'), videoClip('second', 'unused')]));
    cacheFrame(worker, latestSeekRequest(worker)!.generation, 'first', 0.5);
    const seekCount = worker.requests.filter((request) => request.type === 'seek').length;

    const pending = engine.seek(0.5, 'scrub');
    await flushPromises();
    const request = latestSeekRequest(worker)!;
    expect(request).toMatchObject({ type: 'seek', mode: 'scrub', timelineSeconds: 0.5 });
    expect(worker.requests.filter((entry) => entry.type === 'seek')).toHaveLength(seekCount + 1);
    expect(worker.requests.some((entry) => entry.type === 'cancel-seek')).toBe(false);
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

  it.each([
    ['playback rate', { sourceInMs: 500, playbackRate: 2 }, 1.5],
    ['freeze frame', { sourceInMs: 500, playbackRate: 2, freezeFrameSourceMs: 750 }, 0.75],
  ] as const)('looks up the %s source time for a paused cache hit', async (_name, overrides, sourceTime) => {
    const worker = new FakeWorker();
    const audio = new FakeAudio();
    const engine = new MediaPlaybackEngine({
      workerFactory: () => worker,
      audio: audio as unknown as AudioPlaybackScheduler,
    });
    await load(engine, worker, composition([videoClip('clip-1', 'asset-1', overrides)]));
    const bitmap = cacheFrame(worker, latestSeekRequest(worker)!.generation, 'clip-1', sourceTime);
    const seekCount = worker.requests.filter((request) => request.type === 'seek').length;

    await expect(engine.seek(0.5, 'scrub')).resolves.toBe('presented');

    expect(worker.requests.filter((request) => request.type === 'seek')).toHaveLength(seekCount);
    expect(engine.frameFor('clip-1')?.bitmap).toBe(bitmap);
    engine.dispose();
  });

  it('keeps final seeks on the audio and worker pipeline even when the frame is cached', async () => {
    const worker = new FakeWorker();
    const audio = new FakeAudio();
    const engine = new MediaPlaybackEngine({
      workerFactory: () => worker,
      audio: audio as unknown as AudioPlaybackScheduler,
    });
    await load(engine, worker);
    cacheFrame(worker, latestSeekRequest(worker)!.generation, 'clip-1', 0.5);
    audio.seek.mockClear();

    const pending = engine.seek(0.5, 'seek');
    await flushPromises();
    const request = latestSeekRequest(worker)!;
    expect(request).toMatchObject({ type: 'seek', mode: 'seek', timelineSeconds: 0.5 });
    expect(audio.seek).toHaveBeenCalledWith(0.5, request.generation, false);
    expect(worker.requests.some((entry) => entry.type === 'cancel-seek')).toBe(false);
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

  it('keeps scrub seeks on the audio and worker pipeline while playback is running', async () => {
    const worker = new FakeWorker();
    const audio = new FakeAudio();
    const engine = new MediaPlaybackEngine({
      workerFactory: () => worker,
      audio: audio as unknown as AudioPlaybackScheduler,
    });
    await load(engine, worker);
    cacheFrame(worker, latestSeekRequest(worker)!.generation, 'clip-1', 0.5);
    await engine.play(0.25);
    audio.seek.mockClear();

    const pending = engine.seek(0.5, 'scrub');
    await flushPromises();
    const request = latestSeekRequest(worker)!;
    expect(request).toMatchObject({ type: 'seek', mode: 'scrub', timelineSeconds: 0.5 });
    expect(audio.seek).toHaveBeenCalledWith(0.5, request.generation, true);
    expect(worker.requests.some((entry) => entry.type === 'cancel-seek')).toBe(false);
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

  it('does not use a cached frame rendered at a different preview quality', async () => {
    const worker = new FakeWorker();
    const audio = new FakeAudio();
    const engine = new MediaPlaybackEngine({
      workerFactory: () => worker,
      audio: audio as unknown as AudioPlaybackScheduler,
    });
    await load(engine, worker);
    cacheFrame(worker, latestSeekRequest(worker)!.generation, 'clip-1', 0.5);

    const changingQuality = engine.setPreviewQuality('half');
    const configure = worker.requests.at(-1);
    expect(configure).toMatchObject({ type: 'configure-preview', previewQuality: 'half' });
    if (!configure || configure.type !== 'configure-preview') throw new Error('Expected preview configuration.');
    worker.emit({ type: 'ready', generation: configure.generation });
    await flushPromises();
    const qualitySeek = latestSeekRequest(worker)!;
    worker.emit({
      type: 'seek-result',
      generation: qualitySeek.generation,
      requestId: qualitySeek.requestId,
      result: 'presented',
      latencyMs: 1,
    });
    await changingQuality;

    const seekCount = worker.requests.filter((request) => request.type === 'seek').length;
    const pending = engine.seek(0.5, 'scrub');
    await flushPromises();
    const request = latestSeekRequest(worker)!;
    expect(request).toMatchObject({ type: 'seek', mode: 'scrub', timelineSeconds: 0.5 });
    expect(worker.requests.filter((entry) => entry.type === 'seek')).toHaveLength(seekCount + 1);
    expect(worker.requests.some((entry) => entry.type === 'cancel-seek')).toBe(false);
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

  it('supersedes older pending scrubs and rejects their late frames after a cache hit', async () => {
    const worker = new FakeWorker();
    const audio = new FakeAudio();
    const engine = new MediaPlaybackEngine({
      workerFactory: () => worker,
      audio: audio as unknown as AudioPlaybackScheduler,
    });
    await load(engine, worker);
    const initialGeneration = latestSeekRequest(worker)!.generation;
    const cachedBitmap = cacheFrame(worker, initialGeneration, 'clip-1', 0.5);

    const olderPending = engine.seek(0.75, 'scrub');
    await flushPromises();
    const olderRequest = latestSeekRequest(worker)!;
    expect(olderRequest.timelineSeconds).toBe(0.75);

    await expect(engine.seek(0.5, 'scrub')).resolves.toBe('presented');
    await expect(olderPending).resolves.toBe('superseded');
    expect(worker.requests).toContainEqual({ type: 'cancel-seek', generation: olderRequest.generation + 1 });

    const lateBitmap = new FakeImageBitmap();
    worker.emit({
      ...frameResponse(olderRequest.generation, 'clip-1', 0.75, lateBitmap),
      requestId: olderRequest.requestId,
    });

    expect(lateBitmap.close).toHaveBeenCalledOnce();
    expect(engine.frameFor('clip-1')?.bitmap).toBe(cachedBitmap);
    engine.dispose();
  });
});
