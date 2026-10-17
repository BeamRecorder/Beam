import { beforeEach, afterEach, describe, expect, it } from 'vitest';
import { MediaPlaybackEngine } from '../media-playback-engine';
import { createComposition } from '@beam/engine/commands/clip-engine';
import { splitClip } from '@beam/engine/commands/split-clip';
import type { PlaybackAudioService } from '../playback-worker-binding-types';
import type { ClipComposition } from '@beam/engine/shared/composition-types';
import {
  FakeWorker,
  FakeAudio,
  FakeImageBitmap,
  asset,
  videoClip,
  load,
  latestSeekRequest,
  frameResponse,
  resetPlaybackGlobals,
  cleanupPlaybackGlobals,
} from './media-playback-engine.fixtures';

beforeEach(resetPlaybackGlobals);
afterEach(cleanupPlaybackGlobals);
const fixture = () => createComposition([asset()], [{ ...videoClip('screen'), kind: 'screen', trackId: 'screen' }]);
function setup() {
  const worker = new FakeWorker(),
    audio = new FakeAudio();
  const engine = new MediaPlaybackEngine({
    workerFactory: () => worker,
    audio: audio as unknown as PlaybackAudioService,
    clock: { requestFrame: () => 1, cancelFrame() {} },
  });
  return { worker, audio, engine };
}
async function apply(engine: MediaPlaybackEngine, worker: FakeWorker, next: ClipComposition, time: number) {
  const pending = engine.loadComposition(next, time);
  const update = worker.requests.at(-1)!;
  expect(update.type).toBe('retime');
  if (update.type !== 'retime') throw new Error('Expected retime');
  worker.emit({ type: 'ready', generation: update.generation });
  for (let i = 0; i < 6; i++) await Promise.resolve();
  const seek = latestSeekRequest(worker)!;
  worker.emit({
    type: 'seek-result',
    generation: seek.generation,
    requestId: seek.requestId,
    result: 'presented',
    latencyMs: 0,
  });
  await pending;
  return seek;
}
function dispose(engine: MediaPlaybackEngine, worker: FakeWorker) {
  engine.dispose();
  worker.emit({ type: 'disposed', generation: 0 });
}

describe('split playback resource retention', () => {
  it('keeps cached pixels, audio inputs and source timing across an actual engine split', async () => {
    const { engine, worker, audio } = setup(),
      doc = fixture();
    await load(engine, worker, doc);
    const bitmap = new FakeImageBitmap();
    worker.emit(frameResponse(latestSeekRequest(worker)!.generation, 'screen', 0, bitmap));
    const states: string[] = [];
    engine.on('state', (state) => states.push(state));
    const next = splitClip(doc, 'screen', 1000, () => 'right');
    const seek = await apply(engine, worker, next, 1);
    expect(seek.timelineSeconds).toBe(1);
    const request = worker.requests.find((r) => r.type === 'retime');
    expect(request?.type === 'retime' && request.clips).toContainEqual(
      expect.objectContaining({
        clipId: 'right',
        sourceInSeconds: 1,
        timelineStartSeconds: 1,
        timelineDurationSeconds: 1,
      }),
    );
    expect(worker.requests.filter((r) => r.type === 'load')).toHaveLength(1);
    expect(audio.loadComposition).toHaveBeenCalledOnce();
    expect(audio.updateComposition).toHaveBeenCalledOnce();
    expect(states).not.toContain('loading');
    expect(bitmap.close).not.toHaveBeenCalled();
    const right = new FakeImageBitmap();
    worker.emit(frameResponse(seek.generation, 'right', 1, right));
    expect(engine.frameFor('right')?.bitmap).toBe(right);
    expect(engine.frameFor('screen')).toBeNull();
    dispose(engine, worker);
    expect(bitmap.close).toHaveBeenCalledOnce();
    expect(right.close).toHaveBeenCalledOnce();
  });
  it('retimes successive cuts, deletion and undo without resetting the playhead to zero', async () => {
    const { engine, worker } = setup(),
      doc = fixture();
    await load(engine, worker, doc);
    const first = splitClip(doc, 'screen', 1000, () => 'right');
    await apply(engine, worker, first, 1.25);
    const second = splitClip(first, 'right', 1500, () => 'last');
    await apply(engine, worker, second, 1.6);
    await apply(engine, worker, { ...second, clips: second.clips.filter((c) => c.id !== 'right') }, 1.6);
    await apply(engine, worker, first, 1.25);
    await apply(engine, worker, doc, 1.25);
    expect(engine.currentTime).toBe(1.25);
    expect(worker.requests.filter((r) => r.type === 'load')).toHaveLength(1);
    dispose(engine, worker);
  });
  it('rejects a stale frame for a removed fragment without closing another live frame', async () => {
    const { engine, worker } = setup(),
      doc = fixture();
    await load(engine, worker, doc);
    const split = splitClip(doc, 'screen', 1000, () => 'right');
    const oldSeek = await apply(engine, worker, split, 1.25);
    const activeSeek = await apply(engine, worker, doc, 1.25);
    const stale = new FakeImageBitmap(),
      current = new FakeImageBitmap();
    worker.emit(frameResponse(activeSeek.generation, 'screen', 1.25, current));
    worker.emit(frameResponse(oldSeek.generation, 'right', 1.25, stale));
    expect(stale.close).toHaveBeenCalledOnce();
    expect(current.close).not.toHaveBeenCalled();
    expect(engine.frameFor('right')).toBeNull();
    expect(engine.frameFor('screen')?.bitmap).toBe(current);
    dispose(engine, worker);
  });
  it('releases deleted clip pixels before another loaded asset can reuse that clip ID', async () => {
    const { engine, worker } = setup();
    const doc = createComposition(
      [asset(), asset('unused')],
      [
        { ...videoClip('screen'), trackId: 'screen' },
        { ...videoClip('other', 'unused'), trackId: 'other' },
        { ...videoClip('extra', 'asset-1', { sourceInMs: 500 }), trackId: 'extra' },
      ],
    );
    await load(engine, worker, doc);
    const old = new FakeImageBitmap();
    worker.emit(frameResponse(latestSeekRequest(worker)!.generation, 'extra', 0.5, old));
    await apply(engine, worker, { ...doc, clips: doc.clips.filter((c) => c.id !== 'extra') }, 0.5);
    expect(old.close).toHaveBeenCalledOnce();
    const next = { ...doc, clips: doc.clips.map((c) => (c.id === 'extra' ? { ...c, assetId: 'unused' } : c)) };
    await apply(engine, worker, next, 0.5);
    expect(engine.frameFor('extra')).toBeNull();
    expect(worker.requests.filter((r) => r.type === 'load')).toHaveLength(1);
    dispose(engine, worker);
    expect(old.close).toHaveBeenCalledOnce();
  });
});
