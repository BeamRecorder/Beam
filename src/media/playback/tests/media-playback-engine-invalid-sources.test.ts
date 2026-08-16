import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { AudioPlaybackScheduler } from '../audio-scheduler';
import { MediaPlaybackEngine } from '../media-playback-engine';
import type { PlaybackWorkerRequest } from '../playback-types';
import type { ClipComposition } from '../../shared';
import {
  asset,
  cleanupPlaybackGlobals,
  FakeAudio,
  FakeWorker,
  load,
  resetPlaybackGlobals,
  videoClip,
} from './media-playback-engine.fixtures';

vi.mock('../playback.worker?worker', () => ({ default: class PlaybackWorker {} }));

beforeEach(resetPlaybackGlobals);
afterEach(cleanupPlaybackGlobals);

describe('MediaPlaybackEngine invalid sources', () => {
  it('reports an invalid visual source without preventing a valid asset from loading', async () => {
    const worker = new FakeWorker();
    const audio = new FakeAudio();
    const engine = new MediaPlaybackEngine({
      workerFactory: () => worker,
      audio: audio as unknown as AudioPlaybackScheduler,
    });
    const states: string[] = [];
    const errors: unknown[] = [];
    engine.on('state', (state) => states.push(state));
    engine.on('error', (error) => errors.push(error));

    const invalid: ClipComposition = {
      schemaVersion: 6,
      keyboardCaptionSessions: [],
      assets: [{ ...asset(), src: 'file:///recording.mp4' }, asset('valid-video')],
      clips: [videoClip('invalid-clip'), videoClip('valid-clip', 'valid-video')],
    };
    await load(engine, worker, invalid);

    expect(engine.state).toBe('paused');
    expect(states).toEqual(['loading', 'paused']);
    expect(errors[0]).toMatchObject({ kind: 'missing', sourceId: 'asset-1' });
    engine.dispose();
  });

  it('skips a video asset with an empty source while loading valid visual media', async () => {
    const worker = new FakeWorker();
    const audio = new FakeAudio();
    const engine = new MediaPlaybackEngine({
      workerFactory: () => worker,
      audio: audio as unknown as AudioPlaybackScheduler,
    });
    const issues: unknown[] = [];
    engine.on('error', (error) => issues.push(error));
    const invalidAsset = { ...asset('missing-video'), src: '' };
    const value: ClipComposition = {
      schemaVersion: 6,
      keyboardCaptionSessions: [],
      assets: [asset(), invalidAsset],
      clips: [videoClip('valid-clip'), videoClip('skipped-clip', 'missing-video')],
    };

    await load(engine, worker, value);

    const loadRequest = worker.requests.find(
      (request): request is Extract<PlaybackWorkerRequest, { type: 'load' }> => request.type === 'load',
    );
    expect(loadRequest?.assets).toEqual([
      expect.objectContaining({ assetId: 'asset-1', url: 'https://cdn.example.test/asset-1.mp4' }),
    ]);
    expect(loadRequest?.clips).toEqual([expect.objectContaining({ clipId: 'valid-clip', assetId: 'asset-1' })]);
    expect(audio.loadComposition).toHaveBeenCalledWith(value);
    expect(issues).toContainEqual(expect.objectContaining({ kind: 'missing', sourceId: 'missing-video' }));
    expect(engine.state).toBe('paused');
    engine.dispose();
  });
});
