import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MediaPlaybackEngine } from '../media-playback-engine';
import type { AudioPlaybackScheduler } from '../audio-scheduler';
import {
  FakeAudio,
  FakeWorker,
  frameResponse,
  latestSeekRequest,
  load,
  resetPlaybackGlobals,
  cleanupPlaybackGlobals,
} from './media-playback-engine.fixtures';
vi.mock('../playback.worker?worker', () => ({ default: class {} }));
beforeEach(() => {
  vi.useFakeTimers();
  resetPlaybackGlobals();
});
afterEach(() => {
  vi.useRealTimers();
  cleanupPlaybackGlobals();
});
const setup = async () => {
  const worker = new FakeWorker(),
    audio = new FakeAudio(),
    engine = new MediaPlaybackEngine({
      workerFactory: () => worker,
      audio: audio as unknown as AudioPlaybackScheduler,
    });
  await load(engine, worker);
  return { engine, worker, audio };
};
const finish = (worker: FakeWorker) => {
  const request = latestSeekRequest(worker)!;
  worker.emit({
    type: 'seek-result',
    generation: request.generation,
    requestId: request.requestId,
    result: 'presented',
    latencyMs: 1,
  });
  return request;
};
const dispose = (engine: MediaPlaybackEngine, worker: FakeWorker) => {
  engine.dispose();
  worker.emit({ type: 'disposed', generation: 0 });
};
describe('keyframe scrub settling', () => {
  it('refines once after 120ms and keeps exact frame cache coverage exact', async () => {
    const { engine, worker, audio } = await setup();
    const scrub = engine.seek(0.731, 'scrub');
    const request = finish(worker);
    await scrub;
    expect(request.mode).toBe('scrub');
    expect(audio.seek).not.toHaveBeenCalledWith(0.731, expect.anything(), expect.anything());
    await vi.advanceTimersByTimeAsync(119);
    expect(latestSeekRequest(worker)).toBe(request);
    await vi.advanceTimersByTimeAsync(1);
    const exact = finish(worker);
    expect(exact.mode).toBe('seek');
    expect(exact.timelineSeconds).toBe(0.731);
    worker.emit(frameResponse(exact.generation, 'clip-1', 0.731));
    await engine.seek(0.732, 'scrub');
    const count = worker.requests.length;
    await vi.advanceTimersByTimeAsync(500);
    expect(worker.requests.length).toBe(count);
    dispose(engine, worker);
  });
  it.each(['pause', 'play', 'dispose', 'release'] as const)('cancels refinement on %s', async (action) => {
    const { engine, worker } = await setup();
    const scrub = engine.seek(0.71, 'scrub');
    finish(worker);
    await scrub;
    if (action === 'release') {
      const exact = engine.seek(0.71, 'seek');
      await Promise.resolve();
      await Promise.resolve();
      finish(worker);
      await exact;
    } else if (action === 'play') await engine.play();
    else engine[action]();
    const count = worker.requests.length;
    await vi.advanceTimersByTimeAsync(500);
    expect(worker.requests.length).toBe(count);
    dispose(engine, worker);
  });
  it('settles only the latest scrub and keeps scrubs during playback exact', async () => {
    const { engine, worker } = await setup();
    const a = engine.seek(0.3, 'scrub');
    finish(worker);
    await a;
    await vi.advanceTimersByTimeAsync(80);
    const b = engine.seek(0.8, 'scrub');
    finish(worker);
    await b;
    await vi.advanceTimersByTimeAsync(120);
    const exact = finish(worker);
    expect(exact.timelineSeconds).toBe(0.8);
    expect(exact.mode).toBe('seek');
    await engine.play();
    const active = engine.seek(0.9, 'scrub');
    await Promise.resolve();
    await Promise.resolve();
    expect(finish(worker).mode).toBe('seek');
    await active;
    dispose(engine, worker);
  });
});
