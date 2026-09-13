import { describe, expect, it } from 'vitest';
import type { MediaAsset } from '~/media/shared/composition-types';
import { prepareWaveform, retainWaveform } from '../audio-waveform-cache';
import type { StoredWaveformSlice, WaveformRequest } from '../audio-waveform-types';

const asset: MediaAsset = {
  id: 'audio-1',
  kind: 'audio',
  name: 'Audio',
  fileName: null,
  durationMs: 1_000,
  width: null,
  height: null,
  src: '/audio.wav',
  origin: 'project',
};

const request = (pointCount: number, source = asset): WaveformRequest => ({
  clip: {
    id: 'clip-1',
    kind: 'audio',
    name: 'Audio',
    timelineStartMs: 0,
    timelineDurationMs: 1_000,
    sourceInMs: 0,
    sourceDurationMs: 1_000,
    playbackRate: 1,
    enabled: true,
    order: 0,
    assetId: source.id,
    role: 'imported',
    volume: 100,
  },
  asset: source,
  sourceStartSeconds: 0,
  sourceEndSeconds: 1,
  pointCount,
  leftPercent: 0,
  widthPercent: 100,
});

const cachedSlice = (
  sourceKey: string,
  peaks: number[],
  bands: number[],
  options: {
    sourceStartSeconds?: number;
    sourceEndSeconds?: number;
    loadingSegments?: StoredWaveformSlice['loadingSegments'];
  } = {},
): StoredWaveformSlice => {
  const sourceStartSeconds = options.sourceStartSeconds ?? 0;
  const sourceEndSeconds = options.sourceEndSeconds ?? 1;
  return {
    bars: [],
    bands: new Float32Array(bands),
    sourceDurationSeconds: sourceEndSeconds - sourceStartSeconds,
    leftPercent: 0,
    widthPercent: 100,
    loadingSegments: options.loadingSegments ?? [],
    sourceKey,
    sourceStartSeconds,
    sourceEndSeconds,
    peaks: new Float32Array(peaks),
  };
};

const keyFor = (source: MediaAsset) => `${source.id}:${source.src}`;

describe('retainWaveform', () => {
  it('projects a retained slice from source time into the requested clip range', () => {
    const slice = cachedSlice(keyFor(asset), [-0.5, 0.5], [0.1, 0.2, 0.3, 0.4], {
      sourceStartSeconds: 2,
      sourceEndSeconds: 6,
    });
    const target = {
      ...request(8),
      sourceStartSeconds: 1,
      sourceEndSeconds: 9,
      leftPercent: 10,
      widthPercent: 80,
    };

    expect(retainWaveform(slice, target)).toEqual(
      expect.objectContaining({
        leftPercent: 20,
        widthPercent: 40,
        sourceStartSeconds: 2,
        sourceEndSeconds: 6,
        peaks: new Float32Array([-0.5, 0.5]),
      }),
    );
  });

  it('rejects a different source and a slice that only touches the requested range', () => {
    const slice = cachedSlice(keyFor(asset), [0, 0], [0, 0, 0, 0], {
      sourceStartSeconds: 2,
      sourceEndSeconds: 6,
    });
    const target = {
      ...request(8),
      sourceStartSeconds: 1,
      sourceEndSeconds: 9,
      leftPercent: 10,
      widthPercent: 80,
    };
    const otherAsset: MediaAsset = { ...asset, id: 'audio-2' };

    expect(retainWaveform(slice, { ...target, asset: otherAsset })).toBeUndefined();
    expect(retainWaveform(slice, { ...target, sourceStartSeconds: 6, sourceEndSeconds: 9 })).toBeUndefined();
  });
});

describe('prepareWaveform', () => {
  it('pools finer cached peaks and bands for a zoomed-out request', () => {
    const prepared = prepareWaveform(
      request(2),
      [
        cachedSlice(
          keyFor(asset),
          [-0.2, 0.2, -0.9, 0.9, -0.1, 0.1, -0.5, 0.5],
          [0.1, 0.2, 0.3, 0.4, 0.5, 0.25, 0.75, 0.2, 0.3, 0.1, 0.1, 0.1, 0.7, 0.4, 0.2, 0.8],
        ),
      ],
      2,
    );

    expect(prepared.reusedPoints).toBe(2);
    expect(prepared.segments).toEqual([]);
    expect(prepared.peaks).toEqual(new Float32Array([-0.9, 0.9, -0.5, 0.5]));
    expect(prepared.bands).toEqual(new Float32Array([0.5, 0.25, 0.75, 0.4, 0.7, 0.4, 0.2, 0.8]));
  });

  it('reuses completed points and requests only the cached slice gaps', () => {
    const prepared = prepareWaveform(
      request(4),
      [
        cachedSlice(
          keyFor(asset),
          [-0.1, 0.1, -0.2, 0.2, -0.3, 0.3, -0.4, 0.4],
          [0.1, 0.2, 0.3, 0.4, 0.2, 0.3, 0.4, 0.5, 0.3, 0.4, 0.5, 0.6, 0.4, 0.5, 0.6, 0.7],
          { loadingSegments: [{ leftPercent: 25, widthPercent: 50 }] },
        ),
      ],
      1,
    );

    expect(prepared.reusedPoints).toBe(2);
    expect(prepared.peaks).toEqual(new Float32Array([-0.1, 0.1, 0, 0, 0, 0, -0.4, 0.4]));
    expect(prepared.bands).toEqual(new Float32Array([0.1, 0.2, 0.3, 0.4, 0, 0, 0, 0, 0, 0, 0, 0, 0.4, 0.5, 0.6, 0.7]));
    expect(prepared.segments).toEqual([
      {
        index: 0,
        count: 1,
        pointOffset: 1,
        pointCount: 2,
        startSeconds: 0.25,
        endSeconds: 0.75,
      },
    ]);
  });

  it('does not reuse a different source or cached bins with insufficient density', () => {
    const requestForAsset = request(8);
    const otherAsset: MediaAsset = { ...asset, id: 'audio-2' };
    const prepared = prepareWaveform(
      requestForAsset,
      [
        cachedSlice(keyFor(otherAsset), Array(16).fill(0), Array(32).fill(1)),
        cachedSlice(keyFor(asset), Array(8).fill(0), Array(16).fill(1)),
      ],
      2,
    );

    expect(prepared.reusedPoints).toBe(0);
    expect(prepared.peaks).toEqual(new Float32Array(16));
    expect(prepared.bands).toEqual(new Float32Array(32));
    expect(prepared.segments).toEqual([
      { index: 0, count: 2, pointOffset: 0, pointCount: 4, startSeconds: 0, endSeconds: 0.5 },
      { index: 1, count: 2, pointOffset: 4, pointCount: 4, startSeconds: 0.5, endSeconds: 1 },
    ]);
  });
});
