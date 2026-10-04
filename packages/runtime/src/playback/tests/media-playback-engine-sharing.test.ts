import { browserPlaybackClock } from '@beam/runtime/browser';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MediaPlaybackEngine } from '@beam/runtime/playback/media-playback-engine';
import type { AudioPlaybackScheduler } from '@beam/runtime/playback/audio-scheduler';
import {
  FakeWorker,
  FakeAudio,
  FakeImageBitmap,
  composition,
  videoClip,
  load,
  latestSeekRequest,
  frameResponse,
  resetPlaybackGlobals,
  cleanupPlaybackGlobals,
} from '@beam/runtime/playback/tests/media-playback-engine.fixtures';
vi.mock('@beam/runtime/playback/playback.worker?worker', () => ({ default: class PlaybackWorker {} }));
beforeEach(resetPlaybackGlobals);
afterEach(cleanupPlaybackGlobals);
const create = () => {
  const worker = new FakeWorker();
  const audio = new FakeAudio();
  return {
    worker,
    engine: new MediaPlaybackEngine({
      clock: browserPlaybackClock,
      workerFactory: () => worker,
      audio: audio as unknown as AudioPlaybackScheduler,
    }),
  };
};
const retime = async (engine: MediaPlaybackEngine, worker: FakeWorker, value: ReturnType<typeof composition>) => {
  const pending = engine.loadComposition(value);
  const request = worker.requests.at(-1)!;
  if (request.type !== 'retime') throw new Error('Expected an in-place retime request.');
  worker.emit({ type: 'ready', generation: request.generation });
  for (let i = 0; i < 4; i++) await Promise.resolve();
  const seek = latestSeekRequest(worker)!;
  worker.emit({
    type: 'seek-result',
    generation: seek.generation,
    requestId: seek.requestId,
    result: 'presented',
    latencyMs: 1,
  });
  await pending;
  return seek.generation;
};
describe('shared playback frame ownership', () => {
  it('changes the decode leader after reordering layers without transferring or closing stale pixels twice', async () => {
    const { worker, engine } = create();
    await load(engine, worker, composition([videoClip('one'), videoClip('two')]));
    const old = new FakeImageBitmap();
    worker.emit(frameResponse(latestSeekRequest(worker)!.generation, 'one', 0, old));
    const generation = await retime(engine, worker, composition([videoClip('two'), videoClip('one')]));
    const next = new FakeImageBitmap();
    worker.emit(frameResponse(generation, 'two', 0, next));
    expect(engine.frameFor('one')?.bitmap).toBe(next);
    expect(engine.frameFor('two')?.bitmap).toBe(next);
    expect(old.close).not.toHaveBeenCalled();
    engine.dispose();
    expect(old.close).toHaveBeenCalledOnce();
    expect(next.close).toHaveBeenCalledOnce();
    worker.emit({ type: 'disposed', generation: 0 });
  });
  it('splits previously shared instances when their source offsets diverge during retiming', async () => {
    const { worker, engine } = create();
    await load(engine, worker, composition([videoClip('one'), videoClip('two')]));
    const generation = await retime(
      engine,
      worker,
      composition([videoClip('one'), videoClip('two', 'asset-1', { sourceInMs: 100 })]),
    );
    const request = [...worker.requests].reverse().find((item) => item.type === 'retime');
    expect(request?.type === 'retime' && request.clips.length).toBe(2);
    const first = new FakeImageBitmap(),
      second = new FakeImageBitmap();
    worker.emit(frameResponse(generation, 'one', 0, first));
    worker.emit(frameResponse(generation, 'two', 0.1, second));
    expect(engine.frameFor('one')?.bitmap).toBe(first);
    expect(engine.frameFor('two')?.bitmap).toBe(second);
    engine.dispose();
    expect(first.close).toHaveBeenCalledOnce();
    expect(second.close).toHaveBeenCalledOnce();
    worker.emit({ type: 'disposed', generation: 0 });
  });
  it('draws all duplicate layers from one transferred bitmap and closes it only once', async () => {
    const { worker, engine } = create();
    await load(engine, worker, composition([videoClip('one'), videoClip('two')]));
    const loaded = worker.requests.find((request) => request.type === 'load');
    expect(loaded?.type === 'load' && loaded.clips.map((clip) => clip.clipId)).toEqual(['one']);
    const bitmap = new FakeImageBitmap();
    worker.emit(frameResponse(latestSeekRequest(worker)!.generation, 'one', 0, bitmap));
    expect(engine.frameFor('one')).toBe(engine.frameFor('two'));
    expect(engine.frameFor('two')?.bitmap).toBe(bitmap);
    engine.dispose();
    expect(bitmap.close).toHaveBeenCalledOnce();
    worker.emit({ type: 'disposed', generation: 0 });
  });
  it('satisfies cached scrubs for every duplicate without another decoder request', async () => {
    const { worker, engine } = create();
    await load(engine, worker, composition([videoClip('one'), videoClip('two')]));
    worker.emit(frameResponse(latestSeekRequest(worker)!.generation, 'one', 0));
    expect(await engine.seek(0.01, 'scrub')).toBe('presented');
    expect(worker.requests.at(-1)?.type).toBe('cancel-seek');
    expect(engine.frameFor('two')).not.toBeNull();
    engine.dispose();
    worker.emit({ type: 'disposed', generation: 0 });
  });
  it('does not merge held and normally playing instances of the same asset', async () => {
    const { worker, engine } = create();
    await load(
      engine,
      worker,
      composition([videoClip('one'), videoClip('hold', 'asset-1', { freezeFrameSourceMs: 0 })]),
    );
    const loaded = worker.requests.find((request) => request.type === 'load');
    expect(loaded?.type === 'load' && loaded.clips.length).toBe(2);
    const normal = new FakeImageBitmap(),
      held = new FakeImageBitmap();
    const generation = latestSeekRequest(worker)!.generation;
    worker.emit(frameResponse(generation, 'one', 0, normal));
    worker.emit(frameResponse(generation, 'hold', 0, held));
    expect(engine.frameFor('one')?.bitmap).toBe(normal);
    expect(engine.frameFor('hold')?.bitmap).toBe(held);
    engine.dispose();
    worker.emit({ type: 'disposed', generation: 0 });
  });
});
