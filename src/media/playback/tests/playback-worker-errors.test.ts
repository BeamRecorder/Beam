import { describe, expect, it, vi } from 'vitest';
import { MediaInputError, type MediaErrorContext } from '../../shared';
import { consumerPlaybackOperation, playbackMediaError, playbackOperation } from '../playback-worker-errors';
import type { ClipConsumer } from '../playback-worker-consumers';

const context: MediaErrorContext = { operation: 'seek-frame', sourceSeconds: 1, timelineSeconds: 2 };
const consumer = (): ClipConsumer => ({
  asset: {
    assetId: 'screen',
    opened: { dispose: vi.fn() } as never,
    sinkTrack: null,
    displayWidth: 1920,
    displayHeight: 1080,
    decoderConfig: { codec: 'av01.0.08M.08', codedWidth: 1920, codedHeight: 1080 },
    decoderOptions: { hardwareAcceleration: 'prefer-software', optimizeForLatency: false },
  },
  clip: {
    clipId: 'clip',
    assetId: 'screen',
    sourceInSeconds: 2,
    timelineStartSeconds: 4,
    timelineDurationSeconds: 3,
    playbackRate: 2,
  },
  sink: {} as never,
  iterator: null,
  queue: [],
  iteratorGeneration: 0,
  lastTargetSeconds: null,
});

describe('playback error context', () => {
  it('preserves the browser error name, message and source', () => {
    expect(playbackMediaError(new DOMException('Error during flush.', 'EncodingError'), 'screen', context)).toEqual({
      kind: 'decode-failure',
      sourceId: 'screen',
      message: 'Error during flush.',
      context: { ...context, errorName: 'EncodingError' },
    });
  });
  it('preserves structured errors and their original nested context', () => {
    const detail = {
      kind: 'missing' as const,
      sourceId: 'screen',
      message: 'Missing file',
      context: { operation: 'open-media' as const },
    };
    expect(playbackMediaError(new MediaInputError(detail), 'screen')).toEqual(detail);
    expect(playbackMediaError(new MediaInputError(detail), 'screen', context).context?.operation).toBe('open-media');
  });
  it('reports the underlying cause without serializing it into context', () => {
    const error = new MediaInputError({
      kind: 'decode-failure',
      sourceId: 'screen',
      message: 'Cannot open',
      cause: new TypeError('Network failure'),
    });
    expect(playbackMediaError(error, 'screen', { operation: 'open-media' }).context).toEqual({
      operation: 'open-media',
      errorName: 'TypeError',
      causeMessage: 'Network failure',
    });
  });
  it('keeps unknown failures explicit without inventing browser details', () => {
    expect(playbackMediaError(null, 'playback', context)).toEqual({
      kind: 'decode-failure',
      sourceId: 'playback',
      message: 'Playback decoding failed.',
      context,
    });
  });
  it('returns successful operation results unchanged', async () => {
    const result = { frame: true };
    expect(await playbackOperation('screen', context, async () => result)).toBe(result);
  });
  it('wraps both synchronous and asynchronous operation failures', async () => {
    for (const run of [
      () => {
        throw new Error('sync');
      },
      async () => {
        throw new Error('async');
      },
    ]) {
      await expect(playbackOperation('screen', context, run)).rejects.toMatchObject({
        detail: { sourceId: 'screen', context: { operation: 'seek-frame' } },
      });
    }
  });
  it('records mapped source/timeline time and actual decoder options', async () => {
    await expect(
      consumerPlaybackOperation(consumer(), 'decode-frame', 5, async () => {
        throw new Error('Decoding error.');
      }),
    ).rejects.toMatchObject({
      detail: {
        sourceId: 'screen',
        context: {
          operation: 'decode-frame',
          clipId: 'clip',
          timelineSeconds: 5,
          sourceSeconds: 4,
          codec: 'av01.0.08M.08',
          codedWidth: 1920,
          codedHeight: 1080,
          hardwareAcceleration: 'prefer-software',
          optimizeForLatency: false,
        },
      },
    });
  });
  it('reports freeze source time and default acceleration when no preference was accepted', async () => {
    const current = consumer();
    current.clip.freezeFrameSourceSeconds = 1.5;
    current.asset.decoderOptions = undefined;
    await expect(
      consumerPlaybackOperation(current, 'seek-frame', 6, async () => {
        throw new Error('flush');
      }),
    ).rejects.toMatchObject({ detail: { context: { sourceSeconds: 1.5, hardwareAcceleration: 'no-preference' } } });
  });
  it('omits unknown reset times and returns success without wrapping', async () => {
    expect(await consumerPlaybackOperation(consumer(), 'reset-decoder', undefined, async () => 42)).toBe(42);
    try {
      await consumerPlaybackOperation(consumer(), 'reset-decoder', undefined, async () => {
        throw 'cleanup';
      });
    } catch (error) {
      expect(error).toBeInstanceOf(MediaInputError);
      const detail = (error as MediaInputError).detail;
      expect(detail.context).not.toHaveProperty('sourceSeconds');
      expect(detail.context).not.toHaveProperty('timelineSeconds');
    }
  });
});
