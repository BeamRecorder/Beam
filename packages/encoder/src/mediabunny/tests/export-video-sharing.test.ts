vi.mock('@beam/runtime/rendering/snapshot-camera', () => ({ createSnapshotCameraEvaluator: vi.fn() }));
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ExportRequest } from '@beam/encoder/export-types';
import type { ExportAssets } from '@beam/encoder/mediabunny/export-worker-assets';
import type { ExportWorkerOutput } from '@beam/encoder/mediabunny/export-worker-output';
import { createDefaultClipAppearance } from '@beam/engine/shared/composition-defaults';
import { COMPOSITION_SCHEMA_VERSION, type VisualClip } from '@beam/engine/shared/composition-types';

const runtime = vi.hoisted(() => ({
  sinks: vi.fn(),
  advance: vi.fn(),
  close: vi.fn(),
  returned: vi.fn(),
  render: vi.fn(),
}));
vi.mock('mediabunny', async (importOriginal) => ({
  ...(await importOriginal<typeof import('mediabunny')>()),
  VideoSampleSink: class {
    constructor(track: unknown, options: unknown) {
      runtime.sinks(track, options);
    }
    samplesAtTimestamps(timestamps: Iterable<number>) {
      const times = timestamps[Symbol.iterator]();
      return {
        [Symbol.asyncIterator]() {
          return {
            async next() {
              const item = times.next();
              runtime.advance(item.value);
              return {
                done: item.done,
                value: item.done
                  ? undefined
                  : {
                      displayWidth: 2,
                      displayHeight: 2,
                      toCanvasImageSource: () => ({}),
                      close: runtime.close,
                    },
              };
            },
            async return() {
              runtime.returned();
              return { done: true, value: undefined };
            },
          };
        },
      };
    }
  },
}));
vi.mock('@beam/runtime/rendering/render', () => ({
  renderCompositionFrame: runtime.render,
  disposeCompositionRenderer: vi.fn(),
}));
import { renderExportVideo } from '@beam/encoder/mediabunny/export-worker-pipelines';

const clip = (id: string, sourceInMs = 0): VisualClip => ({
  id,
  kind: 'video',
  name: id,
  assetId: 'video',
  trackId: id,
  order: 0,
  enabled: true,
  timelineStartMs: 0,
  timelineDurationMs: 1000,
  sourceInMs,
  sourceDurationMs: 1000,
  playbackRate: 1,
  transform: { x: 0, y: 0, width: 1, height: 1 },
  appearance: createDefaultClipAppearance('video'),
  isMirrored: false,
  isMirroredY: false,
});
const run = async (
  clips: VisualClip[],
  codec = 'vp9',
  userAgent = 'Linux',
  fail = false,
  prepareVideo?: (frame: number) => Promise<void>,
) => {
  vi.stubGlobal('navigator', { userAgent });
  const request = {
    snapshot: {
      duration: 1,
      canvas: { width: 2, height: 2 },
      render: { fps: 3 },
      background: null,
      composition: { schemaVersion: COMPOSITION_SCHEMA_VERSION, clips, assets: [], keyboardCaptionSessions: [] },
      cursor: { events: [] },
      cursorSettings: { motion: {} },
    },
  } as unknown as ExportRequest;
  const track = { getCodec: vi.fn().mockResolvedValue(codec) };
  const assets = { assets: new Map([['video', { video: track }]]), screenSize: null } as unknown as ExportAssets;
  const addVideo = fail ? vi.fn().mockRejectedValue(new Error('encoder failed')) : vi.fn().mockResolvedValue(undefined);
  const output = { addVideo, closeVideo: vi.fn(), prepareVideo } as unknown as ExportWorkerOutput;
  await renderExportVideo(
    request,
    assets,
    new Map(),
    new Map(),
    {} as OffscreenCanvasRenderingContext2D,
    output,
    new AbortController().signal,
    () => {},
  );
  return { output, track };
};
beforeEach(() => vi.clearAllMocks());
afterEach(() => vi.unstubAllGlobals());
describe('export shared video decoding', () => {
  it('prepares platform frame capture before drawing each requested frame', async () => {
    const prepare = vi.fn().mockResolvedValue(undefined);
    await run([clip('one')], 'vp9', 'Linux', false, prepare);
    expect(prepare.mock.calls).toEqual([[0], [1], [2]]);
    prepare.mock.invocationCallOrder.forEach((order, frame) =>
      expect(order).toBeLessThan(runtime.render.mock.invocationCallOrder[frame]!),
    );
  });
  it('releases decoded samples when platform preparation fails', async () => {
    const prepare = vi.fn().mockRejectedValue(new Error('capture unavailable'));
    await expect(run([clip('one')], 'vp9', 'Linux', false, prepare)).rejects.toThrow('capture unavailable');
    expect(runtime.render).not.toHaveBeenCalled();
    expect(runtime.close).toHaveBeenCalledOnce();
    expect(runtime.returned).toHaveBeenCalledOnce();
  });
  it('decodes each exact duplicate once per output frame, renders every layer, and closes samples once', async () => {
    await run([clip('one'), clip('two')]);
    expect(runtime.sinks).toHaveBeenCalledOnce();
    expect(runtime.advance).toHaveBeenCalledTimes(3);
    expect(runtime.close).toHaveBeenCalledTimes(3);
    expect(runtime.returned).toHaveBeenCalledOnce();
    const visuals = runtime.render.mock.calls[0]![6] as Map<string, unknown>;
    expect(visuals.size).toBe(2);
    expect(visuals.get('one')).toBe(visuals.get('two'));
    expect(runtime.sinks.mock.calls[0]![1]).toEqual({
      hardwareAcceleration: 'prefer-software',
      optimizeForLatency: false,
    });
  });
  it('keeps different source offsets independent and leaves other platforms decoder policy unchanged', async () => {
    await run([clip('one'), clip('two', 100)], 'vp9', 'Windows');
    expect(runtime.sinks).toHaveBeenCalledTimes(2);
    expect(runtime.advance).toHaveBeenCalledTimes(6);
    expect(runtime.returned).toHaveBeenCalledTimes(2);
    expect(runtime.sinks.mock.calls[0]![1]).toBeUndefined();
  });
  it('returns each shared iterator once after a downstream encoding failure', async () => {
    await expect(run([clip('one'), clip('two')], 'av1', 'Linux', true)).rejects.toThrow('encoder failed');
    expect(runtime.close).toHaveBeenCalledOnce();
    expect(runtime.returned).toHaveBeenCalledOnce();
    expect(runtime.sinks).toHaveBeenCalledOnce();
  });
});
