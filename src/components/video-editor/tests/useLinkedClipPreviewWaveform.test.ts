import { defineComponent, h, nextTick, ref, type Ref } from 'vue';
import { mount, type VueWrapper } from '@vue/test-utils';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { AudioClip, MediaAsset } from '~/media/shared/composition-types';
import type { WaveformWorkerRequest, WaveformWorkerResponse } from '~/media/playback/waveform-protocol';
import { useLinkedClipPreviewWaveform } from '../useLinkedClipPreviewWaveform';

const workerState = vi.hoisted(() => {
  class FakeWorker {
    onmessage?: (event: MessageEvent<unknown>) => void;
    onerror?: () => void;
    postMessage = vi.fn<(message: unknown) => void>();
    terminate = vi.fn<() => void>();

    constructor() {
      instances.push(this);
    }
  }
  const instances: FakeWorker[] = [];
  return { FakeWorker, instances };
});

vi.mock('~/media/playback/waveform.worker?worker', () => ({ default: workerState.FakeWorker }));

const clip: AudioClip = {
  id: 'microphone-clip',
  kind: 'audio',
  name: 'Microphone',
  assetId: 'recording',
  role: 'microphone',
  timelineStartMs: 0,
  timelineDurationMs: 2_000,
  sourceInMs: 1_250,
  sourceDurationMs: 2_000,
  playbackRate: 1,
  enabled: true,
  order: 0,
  volume: 100,
};
const videoAsset: MediaAsset = {
  id: 'recording',
  kind: 'video',
  name: 'Recording',
  fileName: 'recording.webm',
  durationMs: 20_000,
  width: 1_920,
  height: 1_080,
  src: 'project-media://asset/recording.webm',
  origin: 'project',
};

let wrapper: VueWrapper | undefined;
let state!: ReturnType<typeof useLinkedClipPreviewWaveform>;

const mountComposable = (initialClip: AudioClip = clip, initialAsset: MediaAsset | null = videoAsset) => {
  const clipRef = ref(initialClip) as Ref<AudioClip>;
  const assetRef = ref<MediaAsset | null>(initialAsset);
  const Harness = defineComponent({
    setup() {
      state = useLinkedClipPreviewWaveform(clipRef, assetRef);
      return () => h('div');
    },
  });
  wrapper = mount(Harness);
  return { clipRef, assetRef };
};

const requestFor = (index: number) => {
  const worker = workerState.instances[index];
  if (!worker) throw new Error(`Waveform worker ${index} was not created.`);
  const message = worker.postMessage.mock.calls.find(
    ([value]) => (value as WaveformWorkerRequest).type === 'extract',
  )?.[0];
  if (!message || (message as WaveformWorkerRequest).type !== 'extract')
    throw new Error(`Waveform extraction ${index} was not requested.`);
  return message as Extract<WaveformWorkerRequest, { type: 'extract' }>;
};

const respond = (
  workerIndex: number,
  request: Extract<WaveformWorkerRequest, { type: 'extract' }>,
  pointOffset: number,
  pointCount: number,
  amplitude: number,
  complete: boolean,
) => {
  const worker = workerState.instances[workerIndex];
  const response: WaveformWorkerResponse = {
    type: 'result',
    generation: request.generation,
    clipId: request.clipId,
    segmentIndex: 0,
    segmentCount: 1,
    segmentPointOffset: pointOffset,
    segmentComplete: complete,
    peaks: Float32Array.from({ length: pointCount * 2 }, (_, index) => (index % 2 ? amplitude : -amplitude)),
    bands: Float32Array.from({ length: pointCount * 4 }, (_, index) => (index % 4 === 0 ? 0.5 : 0.25)),
  };
  worker?.onmessage?.({ data: response } as MessageEvent<WaveformWorkerResponse>);
};

const flushPublished = async () => {
  await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
  await nextTick();
};

afterEach(() => {
  wrapper?.unmount();
  wrapper = undefined;
  workerState.instances.length = 0;
  vi.restoreAllMocks();
});

describe('useLinkedClipPreviewWaveform', () => {
  it('extracts only the trimmed audio range even when the source asset is video', () => {
    mountComposable();

    expect(workerState.instances).toHaveLength(1);
    expect(requestFor(0)).toEqual(
      expect.objectContaining({
        clipId: clip.id,
        source: expect.objectContaining({ kind: 'video', url: videoAsset.src }),
        startSeconds: 1.25,
        endSeconds: 3.25,
        segmentIndex: 0,
        segmentCount: 1,
      }),
    );
    expect(state.sourceDurationSeconds.value).toBe(2);
    expect(state.status.value).toBe('loading');
    expect(state.loadingSegments.value).toEqual([{ leftPercent: 0, widthPercent: 100 }]);
  });

  it('requests bounded extra waveform detail for a zoomed long clip', () => {
    mountComposable({ ...clip, timelineDurationMs: 600_000, sourceDurationMs: 600_000 });

    expect(requestFor(0).pointCount).toBe(2_048);
    expect(state.sourceDurationSeconds.value).toBe(600);
  });

  it('streams real peaks and frequency bands while marking the unanalysed tail', async () => {
    mountComposable();
    const request = requestFor(0);
    const firstCount = Math.min(32, request.pointCount - 1);

    respond(0, request, 0, firstCount, 0.5, false);
    await flushPublished();

    expect(state.status.value).toBe('loading');
    expect(state.bars.value).toHaveLength(request.pointCount);
    expect(state.bars.value.slice(0, firstCount).every((height) => height === 19)).toBe(true);
    expect(state.bars.value.slice(firstCount).every((height) => height === 0)).toBe(true);
    expect(Array.from(state.bands.value.slice(0, 4))).toEqual([0.5, 0.25, 0.25, 0.25]);
    expect(state.loadingSegments.value[0]?.leftPercent).toBeCloseTo((firstCount / request.pointCount) * 100);

    respond(0, request, firstCount, request.pointCount - firstCount, 0.25, true);
    await flushPublished();

    expect(state.status.value).toBe('ready');
    expect(state.bars.value.slice(firstCount).every((height) => height === 9.5)).toBe(true);
    expect(state.loadingSegments.value).toEqual([]);
  });

  it('cancels the old worker and ignores late chunks after selecting another clip', async () => {
    const { clipRef } = mountComposable();
    const firstRequest = requestFor(0);
    clipRef.value = { ...clip, id: 'second-microphone', sourceInMs: 5_000 };
    await nextTick();

    expect(workerState.instances).toHaveLength(2);
    expect(workerState.instances[0]?.terminate).toHaveBeenCalledOnce();
    expect(workerState.instances[0]?.postMessage).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'clear', generation: expect.any(Number) }),
    );
    expect(requestFor(1).startSeconds).toBe(5);

    respond(0, firstRequest, 0, firstRequest.pointCount, 1, true);
    await flushPublished();
    expect(state.status.value).toBe('loading');
    expect(state.bars.value).toEqual([]);

    const secondRequest = requestFor(1);
    respond(1, secondRequest, 0, secondRequest.pointCount, 0.5, true);
    await flushPublished();
    expect(state.status.value).toBe('ready');
    expect(state.bars.value[0]).toBe(19);
  });

  it('reports worker errors without presenting fabricated waveform data', () => {
    mountComposable();
    workerState.instances[0]?.onerror?.();

    expect(state.status.value).toBe('error');
    expect(state.bars.value).toEqual([]);
    expect(state.loadingSegments.value).toEqual([]);
    expect(workerState.instances[0]?.terminate).toHaveBeenCalledOnce();
  });

  it('does not start a decoder without a usable source and releases the active worker on unmount', () => {
    const { assetRef } = mountComposable(clip, null);
    expect(state.status.value).toBe('idle');
    expect(workerState.instances).toHaveLength(0);

    assetRef.value = videoAsset;
    return nextTick().then(() => {
      const worker = workerState.instances[0];
      expect(worker).toBeDefined();
      wrapper?.unmount();
      wrapper = undefined;
      expect(worker?.postMessage).toHaveBeenCalledWith(expect.objectContaining({ type: 'clear' }));
      expect(worker?.terminate).toHaveBeenCalledOnce();
    });
  });
});
