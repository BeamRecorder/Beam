import { defineComponent, h, nextTick, ref } from 'vue';
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils';
import { afterEach, describe, expect, it, vi, type Mock } from 'vitest';
import { useCompositionAudioWaveforms, type AudioWaveformViewport } from '../useCompositionAudioWaveforms';
import {
  composition,
  extractRequests,
  latestGeneration,
  respond,
  respondAllSegments,
  respondChunk,
  respondSegment,
  segmentBands,
  segmentOffset,
  twoAudioClipComposition,
} from './useCompositionAudioWaveforms.test-support';

type FakeWaveformWorkerInstance = {
  onmessage?: (event: MessageEvent) => void;
  onerror?: () => void;
  postMessage: Mock<(message: unknown) => void>;
  terminate: Mock<() => void>;
};

const waveformWorkerState = vi.hoisted(() => {
  const instances: FakeWaveformWorkerInstance[] = [];
  class FakeWaveformWorker {
    onmessage?: (event: MessageEvent) => void;
    onerror?: () => void;
    postMessage = vi.fn<(message: unknown) => void>();
    terminate = vi.fn<() => void>();

    constructor() {
      instances.push(this);
    }
  }
  return { FakeWaveformWorker, instances };
});

vi.mock('~/media/playback/waveform.worker?worker', () => ({
  default: waveformWorkerState.FakeWaveformWorker,
}));

let wrapper: VueWrapper | undefined;
let state!: ReturnType<typeof useCompositionAudioWaveforms>;

const mountComposable = (
  value = composition(),
  viewport: AudioWaveformViewport = { startSeconds: 0, endSeconds: 2, pixelsPerSecond: 1_350 },
) => {
  const compositionRef = ref(value);
  const viewportRef = ref<AudioWaveformViewport>(viewport);
  const Harness = defineComponent({
    setup() {
      state = useCompositionAudioWaveforms(
        () => compositionRef.value,
        () => viewportRef.value,
      );
      return () => h('div');
    },
  });
  wrapper = mount(Harness);
  return { compositionRef, viewportRef };
};

const workerPool = () => {
  if (waveformWorkerState.instances.length === 0) throw new Error('Expected a waveform worker pool.');
  return waveformWorkerState.instances;
};

const flushPublished = async () => {
  await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
  await nextTick();
};

afterEach(() => {
  wrapper?.unmount();
  wrapper = undefined;
  waveformWorkerState.instances.length = 0;
  vi.restoreAllMocks();
});

describe('useCompositionAudioWaveforms', () => {
  it('dispatches three direct refined segments with contiguous ranges and no coarse preview', async () => {
    mountComposable();
    await flushPromises();

    const pool = workerPool();
    const segments = extractRequests(pool, 'clip', 1);
    expect(segments).toHaveLength(3);
    expect(segments.map(({ segmentIndex }) => segmentIndex)).toEqual([0, 1, 2]);
    expect(segments.every(({ segmentCount }) => segmentCount === 3)).toBe(true);
    expect(segments.every((request) => !('resolution' in request))).toBe(true);
    expect(segments[0]).toEqual(
      expect.objectContaining({
        startSeconds: 0.25,
        segmentIndex: 0,
        segmentCount: 3,
      }),
    );
    expect(segments[2]?.endSeconds).toBe(1.25);
    expect(segments[0]?.endSeconds).toBeCloseTo(segments[1]?.startSeconds ?? 0, 8);
    expect(segments[1]?.endSeconds).toBeCloseTo(segments[2]?.startSeconds ?? 0, 8);
    expect(segments.reduce((sum, request) => sum + request.pointCount, 0)).toBe(450);

    expect(state.status.value.clip).toBe('loading');
    expect(state.slices.value.clip).toBeUndefined();

    const middle = segments[1]!;
    const firstBandValues = [0.125, 0.25, 0.5, 0.75] as const;
    const secondBandValues = [0.0625, 0.1875, 0.375, 0.625] as const;
    respondChunk(pool, middle, 0, 32, 2, false, firstBandValues);
    await flushPublished();
    expect(state.status.value.clip).toBe('loading');
    const middleOffset = segmentOffset(segments, 1);
    expect(state.slices.value.clip?.bars.slice(0, middleOffset).every((bar) => bar === 0)).toBe(true);
    expect(state.slices.value.clip?.bars.slice(middleOffset, middleOffset + 32).every((bar) => bar === 38)).toBe(true);
    expect(state.slices.value.clip?.bands.slice(0, middleOffset * 4).every((band) => band === 0)).toBe(true);
    expect(state.slices.value.clip?.bands.slice(middleOffset * 4, (middleOffset + 32) * 4)).toEqual(
      segmentBands(32, firstBandValues),
    );
    expect(state.slices.value.clip?.sourceDurationSeconds).toBe(1);
    expect(state.slices.value.clip?.loadingSegments).toHaveLength(3);

    respondChunk(pool, middle, 32, middle.pointCount - 32, 2, true, secondBandValues);
    await flushPublished();
    expect(state.slices.value.clip?.loadingSegments).toHaveLength(2);
    expect(
      state.slices.value.clip?.bars.slice(middleOffset, middleOffset + middle.pointCount).every((bar) => bar === 38),
    ).toBe(true);
    expect(state.slices.value.clip?.bars.slice(middleOffset + middle.pointCount).every((bar) => bar === 0)).toBe(true);
    expect(
      state.slices.value.clip?.bands.slice((middleOffset + 32) * 4, (middleOffset + middle.pointCount) * 4),
    ).toEqual(segmentBands(middle.pointCount - 32, secondBandValues));

    respondSegment(pool, segments[0]!, 1);
    respondSegment(pool, segments[2]!, 0.5);
    await flushPublished();
    expect(state.status.value.clip).toBe('ready');
    expect(state.slices.value.clip?.loadingSegments).toEqual([]);
    expect(state.slices.value.clip?.bars).toEqual([
      ...Array.from({ length: segments[0]!.pointCount }, () => 38),
      ...Array.from({ length: segments[1]!.pointCount }, () => 38),
      ...Array.from({ length: segments[2]!.pointCount }, () => 19),
    ]);
    const expectedBands = new Float32Array(450 * 4);
    expectedBands.set(segmentBands(32, firstBandValues), (middleOffset + 0) * 4);
    expectedBands.set(segmentBands(middle.pointCount - 32, secondBandValues), (middleOffset + 32) * 4);
    expect(state.slices.value.clip?.bands).toEqual(expectedBands);
  });

  it('publishes each audio clip independently while segment responses arrive', async () => {
    mountComposable(twoAudioClipComposition());
    await flushPromises();

    const pool = workerPool();
    const firstGeneration = latestGeneration(pool, 'clip');
    const secondGeneration = latestGeneration(pool, 'clip-2');
    const firstSegments = extractRequests(pool, 'clip', firstGeneration);
    const secondSegments = extractRequests(pool, 'clip-2', secondGeneration);
    expect(firstSegments).toHaveLength(3);
    expect(secondSegments).toHaveLength(3);
    expect(state.status.value).toEqual({ clip: 'loading', 'clip-2': 'loading' });

    respondSegment(pool, firstSegments[0]!, 2);
    await flushPublished();
    expect(state.slices.value.clip?.loadingSegments).toHaveLength(2);
    expect(state.slices.value['clip-2']).toBeUndefined();
    expect(state.status.value['clip-2']).toBe('loading');

    respond(pool, {
      type: 'error',
      generation: secondGeneration,
      clipId: 'clip-2',
      error: { kind: 'decode-failure', sourceId: 'audio-2', message: 'The waveform could not be decoded.' },
    });
    await flushPublished();
    expect(state.slices.value['clip-2']).toBeUndefined();
    expect(state.status.value['clip-2']).toBe('error');
    expect(state.errors.value['clip-2']).toEqual({
      kind: 'decode-failure',
      sourceId: 'audio-2',
      message: 'The waveform could not be decoded.',
    });
  });

  it('applies volume gain without requesting another segment extraction', async () => {
    const mounted = mountComposable();
    await flushPromises();
    const pool = workerPool();
    const generation = latestGeneration(pool);
    const segments = respondAllSegments(pool, 'clip', generation, [0.25, 0.25, 0.25]);
    await flushPublished();
    expect(state.slices.value.clip?.bars).toEqual(Array.from({ length: 450 }, () => 9.5));

    const clip = mounted.compositionRef.value.clips[0];
    if (clip.kind !== 'audio') throw new Error('audio fixture missing');
    clip.volume = 0;
    await nextTick();
    expect(state.slices.value.clip?.bars).toEqual(Array.from({ length: 450 }, () => 0));
    clip.volume = 75;
    await nextTick();
    expect(state.slices.value.clip?.bars).toEqual(Array.from({ length: 450 }, () => 7.125));
    expect(extractRequests(pool, 'clip', generation)).toHaveLength(segments.length);
  });

  it('uses the largest absolute sample extremum for one-sided bar height', async () => {
    mountComposable();
    await flushPromises();
    const pool = workerPool();
    const segments = extractRequests(pool, 'clip', latestGeneration(pool));
    const first = segments[0]!;
    respondChunk(pool, first, 0, first.pointCount, -0.1, true, [0, 0, 0, 0], -0.5);
    await flushPublished();

    expect(state.slices.value.clip?.bars.slice(0, first.pointCount)).toEqual(
      Array.from({ length: first.pointCount }, () => 19),
    );
  });

  it('ignores stale segment results after a new source generation starts', async () => {
    const mounted = mountComposable(composition(100, 'https://media.test/first.mp4'));
    await flushPromises();
    const pool = workerPool();
    const firstGeneration = latestGeneration(pool);
    const firstSegments = extractRequests(pool, 'clip', firstGeneration);
    respondSegment(pool, firstSegments[0]!, 2);
    await flushPublished();

    mounted.compositionRef.value = composition(100, 'https://media.test/second.mp4');
    await flushPublished();
    await flushPromises();
    const secondGeneration = latestGeneration(pool);
    expect(secondGeneration).toBeGreaterThan(firstGeneration);
    const secondSegments = extractRequests(pool, 'clip', secondGeneration);
    expect(secondSegments).toHaveLength(3);

    respondSegment(pool, firstSegments[1]!, 0.1, [0.75, 0.5, 0.25, 0.125]);
    await flushPublished();
    expect(state.slices.value.clip).toBeUndefined();
    expect(state.status.value.clip).toBe('loading');

    const currentBandValues = [
      [0.125, 0.25, 0.5, 0.75],
      [0.0625, 0.1875, 0.375, 0.625],
      [0.03125, 0.15625, 0.3125, 0.5625],
    ] as const;
    respondAllSegments(pool, 'clip', secondGeneration, [0.5, 1, 2], [2, 0, 1], currentBandValues);
    await flushPublished();
    expect(state.status.value.clip).toBe('ready');
    expect(state.errors.value).toEqual({});
    expect(state.slices.value.clip?.bars).toEqual([
      ...Array.from({ length: secondSegments[0]!.pointCount }, () => 19),
      ...Array.from({ length: secondSegments[1]!.pointCount }, () => 38),
      ...Array.from({ length: secondSegments[2]!.pointCount }, () => 38),
    ]);
    const expectedCurrentBands = new Float32Array(450 * 4);
    for (const segment of secondSegments) {
      expectedCurrentBands.set(
        segmentBands(segment.pointCount, currentBandValues[segment.segmentIndex]!),
        segmentOffset(secondSegments, segment.segmentIndex) * 4,
      );
    }
    expect(state.slices.value.clip?.bands).toEqual(expectedCurrentBands);
  });

  it('reuses an exact A waveform after an A→B→A source switch without decoding A twice', async () => {
    const mounted = mountComposable(composition(100, 'https://media.test/a.mp4'));
    await flushPromises();
    const pool = workerPool();
    const generationA = latestGeneration(pool);
    const bandValuesA = [
      [0.125, 0.25, 0.5, 0.75],
      [0.0625, 0.1875, 0.375, 0.625],
      [0.03125, 0.15625, 0.3125, 0.5625],
    ] as const;
    respondAllSegments(pool, 'clip', generationA, [2, 1, 0.5], [0, 1, 2], bandValuesA);
    await flushPublished();
    const barsA = state.slices.value.clip?.bars;
    const bandsA = state.slices.value.clip?.bands.slice();
    const sourceDurationA = state.slices.value.clip?.sourceDurationSeconds;
    expect(state.status.value.clip).toBe('ready');
    expect(extractRequests(pool, 'clip')).toHaveLength(3);

    mounted.compositionRef.value = composition(100, 'https://media.test/b.mp4');
    await nextTick();
    await flushPromises();
    const generationB = latestGeneration(pool);
    expect(generationB).toBeGreaterThan(generationA);
    respondAllSegments(
      pool,
      'clip',
      generationB,
      [1, 1, 1],
      [0, 1, 2],
      [
        [0.75, 0.625, 0.5, 0.375],
        [0.625, 0.5, 0.375, 0.25],
        [0.5, 0.375, 0.25, 0.125],
      ],
    );
    await flushPublished();
    expect(extractRequests(pool, 'clip')).toHaveLength(6);

    mounted.compositionRef.value = composition(100, 'https://media.test/a.mp4');
    await nextTick();
    await flushPublished();
    expect(extractRequests(pool, 'clip')).toHaveLength(6);
    expect(state.status.value.clip).toBe('ready');
    expect(state.slices.value.clip?.bars).toEqual(barsA);
    expect(state.slices.value.clip?.bands).toEqual(bandsA);
    expect(state.slices.value.clip?.sourceDurationSeconds).toBe(sourceDurationA);
  });

  it('exposes a real worker error and removes non-drawable waveform data', async () => {
    mountComposable();
    await flushPromises();
    const pool = workerPool();
    const generation = latestGeneration(pool);
    respond(pool, {
      type: 'error',
      generation,
      clipId: 'clip',
      error: {
        kind: 'unsupported-codec',
        sourceId: 'audio',
        track: 'audio',
        codec: 'aac-unsupported',
        message: 'The waveform audio codec is unsupported.',
      },
    });
    await nextTick();
    expect(state.slices.value.clip).toBeUndefined();
    expect(state.errors.value.clip).toEqual({
      kind: 'unsupported-codec',
      sourceId: 'audio',
      track: 'audio',
      codec: 'aac-unsupported',
      message: 'The waveform audio codec is unsupported.',
    });
    expect(state.status.value.clip).toBe('error');
  });

  it('caches complete side-scroll pages and increases total point density after zoom', async () => {
    const value = composition();
    const clip = value.clips[0];
    if (clip?.kind !== 'audio') throw new Error('audio fixture missing');
    clip.timelineDurationMs = 8_000;
    clip.sourceDurationMs = 8_000;
    const mounted = mountComposable(value, { startSeconds: 2, endSeconds: 4, pixelsPerSecond: 120 });
    await flushPromises();

    const pool = workerPool();
    const firstGeneration = latestGeneration(pool);
    const first = extractRequests(pool, 'clip', firstGeneration);
    expect(first).toHaveLength(3);
    expect(first[0]?.startSeconds).toBeCloseTo(0.25, 8);
    expect(first[2]?.endSeconds).toBeCloseTo(6.25, 8);
    expect(first[0]?.endSeconds).toBeCloseTo(first[1]?.startSeconds ?? 0, 8);
    expect(first[1]?.endSeconds).toBeCloseTo(first[2]?.startSeconds ?? 0, 8);
    const firstPointCount = first.reduce((sum, request) => sum + request.pointCount, 0);
    expect(firstPointCount).toBe(240);

    mounted.viewportRef.value = { startSeconds: 2.1, endSeconds: 4.1, pixelsPerSecond: 120 };
    await nextTick();
    await new Promise<void>((resolve) => window.setTimeout(resolve, 125));
    await flushPromises();
    expect(extractRequests(pool, 'clip')).toHaveLength(3);

    respondAllSegments(pool, 'clip', firstGeneration, [0.5, 1, 2]);
    await flushPublished();
    const pageABars = state.slices.value.clip?.bars;
    expect(pageABars).toHaveLength(firstPointCount);

    mounted.viewportRef.value = { startSeconds: 4, endSeconds: 6, pixelsPerSecond: 120 };
    await nextTick();
    await new Promise<void>((resolve) => window.setTimeout(resolve, 125));
    await flushPromises();
    const secondGeneration = latestGeneration(pool);
    expect(secondGeneration).toBeGreaterThan(firstGeneration);
    const second = extractRequests(pool, 'clip', secondGeneration);
    expect(second).toHaveLength(3);
    expect(second[0]?.startSeconds).toBeCloseTo(6.25, 8);
    expect(second[2]?.endSeconds).toBeCloseTo(8.25, 8);
    expect(second[0]?.startSeconds).not.toBe(first[0]?.startSeconds);
    expect(second.reduce((sum, request) => sum + request.pointCount, 0)).toBe(80);
    expect(second.map(({ startSeconds, endSeconds }) => [startSeconds, endSeconds])).toEqual([
      [6.25, expect.any(Number)],
      [expect.any(Number), expect.any(Number)],
      [expect.any(Number), 8.25],
    ]);
    expect(state.status.value.clip).toBe('loading');
    expect(state.slices.value.clip).toEqual(
      expect.objectContaining({ leftPercent: 0, widthPercent: 75, loadingSegments: [] }),
    );
    expect(state.slices.value.clip?.bars).toEqual(pageABars);

    respondSegment(pool, second[0]!, 2);
    await flushPublished();
    expect(state.status.value.clip).toBe('loading');
    expect(state.slices.value.clip).toEqual(
      expect.objectContaining({ leftPercent: 0, widthPercent: 75, loadingSegments: [] }),
    );
    expect(state.slices.value.clip?.bars).toEqual(pageABars);

    respondSegment(pool, second[1]!, 1);
    respondSegment(pool, second[2]!, 0.5);
    await flushPublished();
    expect(state.status.value.clip).toBe('ready');
    expect(state.slices.value.clip).toEqual(
      expect.objectContaining({ leftPercent: 25, widthPercent: 75, loadingSegments: [] }),
    );
    expect(state.slices.value.clip?.bars.slice(0, 160)).toEqual(pageABars?.slice(80));
    expect(state.slices.value.clip?.bars.slice(160, 160 + second[0]!.pointCount).every((bar) => bar === 38)).toBe(true);
    expect(
      state.slices.value.clip?.bars
        .slice(160 + second[0]!.pointCount, 160 + second[0]!.pointCount + second[1]!.pointCount)
        .every((bar) => bar === 38),
    ).toBe(true);
    expect(state.slices.value.clip?.bars.slice(-second[2]!.pointCount).every((bar) => bar === 19)).toBe(true);
    expect(extractRequests(pool, 'clip')).toHaveLength(6);

    mounted.viewportRef.value = { startSeconds: 2, endSeconds: 4, pixelsPerSecond: 120 };
    await nextTick();
    await new Promise<void>((resolve) => window.setTimeout(resolve, 125));
    await flushPublished();
    expect(extractRequests(pool, 'clip')).toHaveLength(6);
    expect(state.status.value.clip).toBe('ready');
    expect(state.slices.value.clip?.bars).toEqual(pageABars);

    mounted.viewportRef.value = { startSeconds: 2, endSeconds: 4, pixelsPerSecond: 60 };
    await nextTick();
    await new Promise<void>((resolve) => window.setTimeout(resolve, 125));
    await flushPublished();
    expect(extractRequests(pool, 'clip')).toHaveLength(6);
    expect(state.status.value.clip).toBe('ready');
    expect(state.slices.value.clip?.bars).toHaveLength(120);

    mounted.viewportRef.value = { startSeconds: 2, endSeconds: 4, pixelsPerSecond: 120 };
    await nextTick();
    await new Promise<void>((resolve) => window.setTimeout(resolve, 125));
    await flushPublished();
    expect(extractRequests(pool, 'clip')).toHaveLength(6);
    expect(state.status.value.clip).toBe('ready');
    expect(state.slices.value.clip?.bars).toEqual(pageABars);

    mounted.viewportRef.value = { startSeconds: 2, endSeconds: 4, pixelsPerSecond: 240 };
    await nextTick();
    await new Promise<void>((resolve) => window.setTimeout(resolve, 125));
    await flushPromises();
    const zoomGeneration = latestGeneration(pool);
    const zoomed = extractRequests(pool, 'clip', zoomGeneration);
    expect(zoomed).toHaveLength(3);
    expect(zoomed.reduce((sum, request) => sum + request.pointCount, 0)).toBeGreaterThan(firstPointCount);
    expect(zoomed.reduce((sum, request) => sum + request.pointCount, 0)).toBe(480);
    expect(state.status.value.clip).toBe('loading');
  });

  it('keeps the ready waveform visible while an uncached zoom request loads', async () => {
    const value = composition();
    const clip = value.clips[0];
    if (clip?.kind !== 'audio') throw new Error('audio fixture missing');
    clip.timelineDurationMs = 8_000;
    clip.sourceDurationMs = 8_000;
    const mounted = mountComposable(value, { startSeconds: 2, endSeconds: 4, pixelsPerSecond: 120 });
    await flushPromises();

    const pool = workerPool();
    const initialGeneration = latestGeneration(pool);
    respondAllSegments(pool, 'clip', initialGeneration, [0.5, 1, 2]);
    await flushPublished();
    const readyBars = state.slices.value.clip?.bars;
    expect(state.status.value.clip).toBe('ready');
    expect(readyBars).toHaveLength(240);

    vi.useFakeTimers();
    try {
      mounted.viewportRef.value = { startSeconds: 2, endSeconds: 4, pixelsPerSecond: 240 };
      await nextTick();
      expect(state.status.value.clip).toBe('ready');
      expect(state.slices.value.clip?.bars).toEqual(readyBars);
      expect(extractRequests(pool, 'clip')).toHaveLength(3);

      await vi.advanceTimersByTimeAsync(119);
      expect(extractRequests(pool, 'clip')).toHaveLength(3);
      expect(state.slices.value.clip?.bars).toEqual(readyBars);

      await vi.advanceTimersByTimeAsync(1);
      await flushPromises();
      const zoomGeneration = latestGeneration(pool);
      expect(zoomGeneration).toBeGreaterThan(initialGeneration);
      const zoomed = extractRequests(pool, 'clip', zoomGeneration);
      expect(zoomed).toHaveLength(3);
      expect(state.status.value.clip).toBe('loading');
      expect(state.slices.value.clip?.bars).toEqual(readyBars);

      respondSegment(pool, zoomed[0]!, 2);
      await vi.runOnlyPendingTimersAsync();
      await nextTick();
      expect(state.slices.value.clip?.bars).toEqual(readyBars);

      respondSegment(pool, zoomed[1]!, 1);
      respondSegment(pool, zoomed[2]!, 0.5);
      await vi.runOnlyPendingTimersAsync();
      await nextTick();
      expect(state.status.value.clip).toBe('ready');
      expect(state.slices.value.clip?.bars).toEqual([
        ...Array.from({ length: zoomed[0]!.pointCount }, () => 38),
        ...Array.from({ length: zoomed[1]!.pointCount }, () => 38),
        ...Array.from({ length: zoomed[2]!.pointCount }, () => 19),
      ]);
    } finally {
      vi.useRealTimers();
    }
  });

  it('debounces rapid viewport changes while the current waveform overlaps their buffered ranges', async () => {
    const value = composition();
    const clip = value.clips[0];
    if (clip?.kind !== 'audio') throw new Error('audio fixture missing');
    clip.timelineDurationMs = 8_000;
    clip.sourceDurationMs = 8_000;
    const mounted = mountComposable(value, { startSeconds: 2, endSeconds: 4, pixelsPerSecond: 120 });
    await flushPromises();

    const pool = workerPool();
    const initialGeneration = latestGeneration(pool);
    respondAllSegments(pool, 'clip', initialGeneration);
    await flushPublished();
    vi.useFakeTimers();
    try {
      mounted.viewportRef.value = { startSeconds: 2.1, endSeconds: 4.1, pixelsPerSecond: 120 };
      await nextTick();
      mounted.viewportRef.value = { startSeconds: 4, endSeconds: 6, pixelsPerSecond: 120 };
      await nextTick();
      mounted.viewportRef.value = { startSeconds: 6, endSeconds: 8, pixelsPerSecond: 120 };
      await nextTick();

      expect(extractRequests(pool, 'clip')).toHaveLength(3);
      expect(state.status.value.clip).toBe('ready');
      await vi.advanceTimersByTimeAsync(119);
      expect(extractRequests(pool, 'clip')).toHaveLength(3);

      await vi.advanceTimersByTimeAsync(1);
      await flushPromises();
      const latest = extractRequests(pool, 'clip');
      expect(latest).toHaveLength(6);
      const latestGenerationRequests = extractRequests(pool, 'clip', latestGeneration(pool));
      expect(latestGenerationRequests).toHaveLength(3);
      expect(latestGenerationRequests[0]?.startSeconds).toBeCloseTo(6.25, 8);
      expect(latestGenerationRequests[2]?.endSeconds).toBeCloseTo(8.25, 8);
      expect(state.status.value.clip).toBe('loading');
    } finally {
      vi.useRealTimers();
    }
  });

  it('keeps empty compositions inert and disposes all workers on unmount', async () => {
    mountComposable({ schemaVersion: 6, assets: [], clips: [], keyboardCaptionSessions: [] });
    await flushPromises();
    expect(state.slices.value).toEqual({});
    expect(waveformWorkerState.instances).toHaveLength(0);

    mountComposable();
    await flushPromises();
    const pool = workerPool();
    expect(extractRequests(pool, 'clip')).toHaveLength(3);
    wrapper?.unmount();
    expect(state.slices.value).toEqual({});
    expect(waveformWorkerState.instances).toHaveLength(3);
    expect(waveformWorkerState.instances.every((instance) => instance.terminate.mock.calls.length === 1)).toBe(true);
  });
});
