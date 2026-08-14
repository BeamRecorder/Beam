import { defineComponent, h, nextTick, ref } from 'vue';
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  useCompositionAudioWaveforms,
  type AudioWaveformViewport,
} from '../useCompositionAudioWaveforms';
import type { ClipComposition } from '~/media/shared/composition-types';
import type { MediaError, MediaSourceDescriptor } from '~/media/shared/media-types';

const waveformWorkerState = vi.hoisted(() => {
  const instances: Array<{
    onmessage?: (event: MessageEvent) => void;
    onerror?: () => void;
    postMessage: ReturnType<typeof vi.fn>;
    terminate: ReturnType<typeof vi.fn>;
  }> = [];
  class FakeWaveformWorker {
    onmessage?: (event: MessageEvent) => void;
    onerror?: () => void;
    postMessage = vi.fn();
    terminate = vi.fn();

    constructor() {
      instances.push(this);
    }
  }
  return { FakeWaveformWorker, instances };
});

vi.mock('~/media/playback/waveform.worker?worker', () => ({
  default: waveformWorkerState.FakeWaveformWorker,
}));

type WaveformWorkerRequest = {
  generation: number;
  type: 'extract' | 'clear';
  clipId: string;
  source: MediaSourceDescriptor;
  startSeconds: number;
  endSeconds: number;
  pointCount: number;
  resolution: 'coarse' | 'refined';
} | { type: 'clear'; generation: number };

type WaveformWorkerResponse =
  | {
      type: 'result';
      generation: number;
      clipId: string;
      resolution: 'coarse' | 'refined';
      peaks: Float32Array;
    }
  | {
      type: 'error';
      generation: number;
      clipId: string;
      error: MediaError;
    };

const composition = (volume = 100, source = 'https://media.test/sound.mp4'): ClipComposition => ({
  schemaVersion: 3,
  keyboardCaptionSessions: [],
  assets: [
    {
      id: 'audio',
      kind: 'audio',
      name: 'Sound',
      fileName: 'sound.mp4',
      durationMs: 2_000,
      width: null,
      height: null,
      src: source,
      origin: 'project',
    },
  ],
  clips: [
    {
      id: 'clip',
      kind: 'audio',
      name: 'Sound',
      assetId: 'audio',
      role: 'imported',
      timelineStartMs: 0,
      timelineDurationMs: 1_000,
      sourceInMs: 250,
      sourceDurationMs: 1_000,
      playbackRate: 1,
      enabled: true,
      order: 0,
      volume,
    },
  ],
});

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
      state = useCompositionAudioWaveforms(() => compositionRef.value, () => viewportRef.value);
      return () => h('div');
    },
  });
  wrapper = mount(Harness);
  return { compositionRef, viewportRef };
};

const worker = () => {
  const instance = waveformWorkerState.instances.at(-1);
  if (!instance) throw new Error('Expected a waveform worker instance.');
  return instance;
};

const requests = (instance = worker()) =>
  instance.postMessage.mock.calls.map(([message]) => message as WaveformWorkerRequest);

const requestFor = (clipId: string, instance = worker(), quality?: 'coarse' | 'refined') =>
  [...requests(instance)].reverse().find(
    (message) => message.type === 'extract' && message.clipId === clipId && (!quality || message.resolution === quality),
  );

const respond = (instance: ReturnType<typeof worker>, response: WaveformWorkerResponse) => {
  instance.onmessage?.({ data: response } as MessageEvent<WaveformWorkerResponse>);
};

const twoAudioClipComposition = () => {
  const value = composition();
  const firstAsset = value.assets[0]!;
  const secondAsset = { ...firstAsset, id: 'audio-2', src: 'https://media.test/second.mp4' };
  const firstClip = value.clips[0]!;
  const secondClip = { ...firstClip, id: 'clip-2', assetId: secondAsset.id, name: 'Second sound' };
  return {
    ...value,
    assets: [...value.assets, secondAsset],
    clips: [firstClip, secondClip],
  };
};

afterEach(() => {
  wrapper?.unmount();
  wrapper = undefined;
  waveformWorkerState.instances.length = 0;
  vi.restoreAllMocks();
});

describe('useCompositionAudioWaveforms', () => {
  it('requests bounded source peaks and applies volume gain to rendered bars', async () => {
    const mounted = mountComposable();
    await flushPromises();

    const coarse = requestFor('clip', worker(), 'coarse');
    expect(coarse).toEqual(
      expect.objectContaining({
        type: 'extract',
        generation: 1,
        clipId: 'clip',
        startSeconds: 0.25,
        endSeconds: 1.25,
        pointCount: 64,
        resolution: 'coarse',
      }),
    );
    if (!coarse) throw new Error('Expected a coarse request.');
    respond(worker(), {
      type: 'result',
      generation: coarse.generation,
      clipId: 'clip',
      resolution: 'coarse',
      peaks: new Float32Array([0, 0.1]),
    });
    await nextTick();

    const refined = requestFor('clip', worker(), 'refined');
    expect(refined).toEqual(
      expect.objectContaining({
        type: 'extract',
        generation: 1,
        clipId: 'clip',
        source: expect.objectContaining<Partial<MediaSourceDescriptor>>({
          assetId: 'audio',
          kind: 'audio',
          url: 'https://media.test/sound.mp4',
        }),
        startSeconds: 0.25,
        endSeconds: 1.25,
        pointCount: 450,
        resolution: 'refined',
      }),
    );

    respond(worker(), {
      type: 'result',
      generation: refined?.generation ?? 1,
      clipId: 'clip',
      resolution: 'refined',
      peaks: new Float32Array([0, 0.2, 0, 0.8]),
    });
    await nextTick();
    expect(state.slices.value.clip?.bars).toEqual([10, 38]);

    const clip = mounted.compositionRef.value.clips[0];
    if (clip.kind !== 'audio') throw new Error('audio fixture missing');
    clip.volume = 0;
    await nextTick();
    expect(state.slices.value.clip?.bars).toEqual([0, 0]);
    clip.volume = 50;
    await nextTick();
    expect(state.slices.value.clip?.bars).toEqual([5, 19]);
    expect(requests().filter((message) => message.type === 'extract')).toHaveLength(2);
  });

  it('keeps only the latest generation when a source changes during extraction', async () => {
    const mounted = mountComposable(composition(100, 'https://media.test/first.mp4'));
    await flushPromises();
    const firstWorker = worker();
    const firstCoarse = requestFor('clip', firstWorker, 'coarse');
    if (!firstCoarse) throw new Error('Expected a coarse request for the first source.');
    respond(firstWorker, {
      type: 'result',
      generation: firstCoarse.generation,
      clipId: 'clip',
      resolution: 'coarse',
      peaks: new Float32Array([0, 0.05]),
    });
    await nextTick();
    const firstRequest = requestFor('clip', firstWorker, 'refined');
    if (!firstRequest) throw new Error('Expected a refined request for the first source.');

    mounted.compositionRef.value = composition(100, 'https://media.test/second.mp4');
    await nextTick();
    await flushPromises();
    const secondWorker = worker();
    const secondCoarse = requestFor('clip', secondWorker, 'coarse');
    if (!secondCoarse) throw new Error('Expected a coarse request for the second source.');
    respond(secondWorker, {
      type: 'result',
      generation: secondCoarse.generation,
      clipId: 'clip',
      resolution: 'coarse',
      peaks: new Float32Array([0, 0.2]),
    });
    await nextTick();
    const secondRequest = requestFor('clip', secondWorker, 'refined');
    if (!secondRequest) throw new Error('Expected a refined request for the second source.');
    expect(secondRequest.generation).toBeGreaterThan(firstRequest.generation);

    respond(secondWorker, {
      type: 'result',
      generation: secondRequest.generation,
      clipId: 'clip',
      resolution: 'refined',
      peaks: new Float32Array([0, 0.4, 0, 0.4]),
    });
    await nextTick();
    expect(state.slices.value.clip?.bars).toEqual([38, 38]);

    respond(firstWorker, {
      type: 'result',
      generation: firstRequest.generation,
      clipId: 'clip',
      resolution: 'refined',
      peaks: new Float32Array([0, 0.1, 0, 0.1]),
    });
    await nextTick();
    expect(state.slices.value.clip?.bars).toEqual([38, 38]);
    expect(state.errors.value).toEqual({});
  });

  it('returns no slice and exposes an explicit worker MediaError', async () => {
    mountComposable();
    await flushPromises();

    const coarse = requestFor('clip', worker(), 'coarse');
    if (!coarse) throw new Error('Expected a coarse request.');
    respond(worker(), {
      type: 'result',
      generation: coarse.generation,
      clipId: 'clip',
      resolution: 'coarse',
      peaks: new Float32Array([0, 0.1]),
    });
    await nextTick();
    const request = requestFor('clip', worker(), 'refined');
    if (!request) throw new Error('Expected a refined request.');
    const error = {
      kind: 'unsupported-codec' as const,
      sourceId: 'audio',
      track: 'audio' as const,
      codec: 'aac-unsupported',
      message: 'The waveform audio codec is unsupported.',
    };
    respond(worker(), { type: 'error', generation: request.generation, clipId: 'clip', error });
    await nextTick();

    expect(state.slices.value.clip).toBeUndefined();
    expect(state.errors.value.clip).toEqual(error);
    expect(state.status.value.clip).toBe('error');
  });

  it('normalizes an unexpected extraction error to a decode-failure MediaError', async () => {
    mountComposable();
    await flushPromises();

    const coarse = requestFor('clip', worker(), 'coarse');
    if (!coarse) throw new Error('Expected a coarse request.');
    respond(worker(), {
      type: 'result',
      generation: coarse.generation,
      clipId: 'clip',
      resolution: 'coarse',
      peaks: new Float32Array([0, 0.1]),
    });
    await nextTick();
    const request = requestFor('clip', worker(), 'refined');
    if (!request) throw new Error('Expected a refined request.');
    respond(worker(), {
      type: 'error',
      generation: request.generation,
      clipId: 'clip',
      error: {
        kind: 'decode-failure',
        sourceId: 'audio',
        message: 'The waveform could not be decoded.',
      },
    });
    await nextTick();

    expect(state.slices.value.clip).toBeUndefined();
    expect(state.errors.value.clip).toEqual({
      kind: 'decode-failure',
      sourceId: 'audio',
      message: 'The waveform could not be decoded.',
    });
    expect(state.status.value.clip).toBe('error');
  });

  it('publishes each clip progressively from coarse to refined without blocking other clips', async () => {
    mountComposable(twoAudioClipComposition());
    await flushPromises();

    const waveformWorker = worker();
    const fastCoarse = requestFor('clip', waveformWorker, 'coarse');
    const slowCoarse = requestFor('clip-2', waveformWorker, 'coarse');
    if (!fastCoarse || !slowCoarse) throw new Error('Expected coarse requests for both audio clips.');
    expect(fastCoarse.pointCount).toBe(64);
    expect(slowCoarse.pointCount).toBe(64);
    expect(state.status.value).toEqual({ clip: 'loading', 'clip-2': 'loading' });

    respond(waveformWorker, {
      type: 'result',
      generation: fastCoarse.generation,
      clipId: 'clip',
      resolution: 'coarse',
      peaks: new Float32Array([0, 0.1, 0, 0.1]),
    });
    await nextTick();

    expect(state.slices.value.clip?.bars).toEqual([38, 38]);
    expect(state.slices.value['clip-2']).toBeUndefined();
    expect(state.status.value.clip).toBe('loading');
    expect(state.status.value['clip-2']).toBe('loading');

    const fastRefined = requestFor('clip', waveformWorker, 'refined');
    if (!fastRefined) throw new Error('Expected the fast clip refined request.');
    expect(fastRefined.pointCount).toBeGreaterThan(fastCoarse.pointCount);
    respond(waveformWorker, {
      type: 'result',
      generation: fastRefined.generation,
      clipId: 'clip',
      resolution: 'refined',
      peaks: new Float32Array([0, 0.2, 0, 0.8]),
    });
    await nextTick();

    expect(state.slices.value.clip?.bars).toEqual([10, 38]);
    expect(state.status.value.clip).toBe('ready');
    expect(state.status.value['clip-2']).toBe('loading');

    const error: MediaError = {
      kind: 'decode-failure',
      sourceId: 'audio-2',
      message: 'The waveform could not be decoded.',
    };
    respond(waveformWorker, {
      type: 'error',
      generation: slowCoarse.generation,
      clipId: 'clip-2',
      error,
    });
    await nextTick();

    expect(state.slices.value['clip-2']).toBeUndefined();
    expect(state.status.value['clip-2']).toBe('error');
    expect(state.errors.value['clip-2']).toEqual(error);
  });

  it('requests the bounded viewport page, avoids same-page scroll reloads, and increases density with pixels per second', async () => {
    const value = composition();
    const clip = value.clips[0];
    if (clip?.kind !== 'audio') throw new Error('audio fixture missing');
    clip.timelineDurationMs = 8_000;
    clip.sourceDurationMs = 8_000;
    const mounted = mountComposable(value, { startSeconds: 2, endSeconds: 4, pixelsPerSecond: 120 });
    await flushPromises();

    const waveformWorker = worker();
    const firstRequests = requests(waveformWorker).filter(
      (message): message is Extract<WaveformWorkerRequest, { type: 'extract' }> => message.type === 'extract',
    );
    expect(firstRequests.length).toBeGreaterThan(0);
    for (const request of firstRequests) {
      expect(request.startSeconds).toBe(0.25);
      expect(request.endSeconds).toBe(6.25);
    }
    const firstPointCount = Math.max(...firstRequests.map((request) => request.pointCount));

    mounted.viewportRef.value = { startSeconds: 2.1, endSeconds: 4.1, pixelsPerSecond: 120 };
    await nextTick();
    await flushPromises();
    expect(
      requests(waveformWorker).filter((message) => message.type === 'extract'),
    ).toHaveLength(firstRequests.length);

    mounted.viewportRef.value = { startSeconds: 2, endSeconds: 4, pixelsPerSecond: 240 };
    await nextTick();
    await flushPromises();

    const secondRequests = requests(waveformWorker).filter(
      (message): message is Extract<WaveformWorkerRequest, { type: 'extract' }> => message.type === 'extract',
    );
    const latestGeneration = Math.max(...secondRequests.map((request) => request.generation));
    const latest = secondRequests.filter((request) => request.generation === latestGeneration);
    expect(latest.length).toBeGreaterThan(0);
    const latestCoarse = latest.find((request) => request.resolution === 'coarse');
    if (!latestCoarse) throw new Error('Expected a coarse request after the density change.');
    respond(waveformWorker, {
      type: 'result',
      generation: latestCoarse.generation,
      clipId: 'clip',
      resolution: 'coarse',
      peaks: new Float32Array([0, 0.1]),
    });
    await nextTick();
    const refinedRequests = requests(waveformWorker).filter(
      (message): message is Extract<WaveformWorkerRequest, { type: 'extract' }> =>
        message.type === 'extract' && message.generation === latestGeneration && message.resolution === 'refined',
    );
    expect(refinedRequests.length).toBeGreaterThan(0);
    expect(Math.max(...refinedRequests.map((request) => request.pointCount))).toBeGreaterThan(firstPointCount);
    for (const request of latest) {
      expect(request.startSeconds).toBe(0.25);
      expect(request.endSeconds).toBe(6.25);
    }
  });

  it('keeps empty compositions inert and ignores clips without a source', async () => {
    mountComposable({ schemaVersion: 3, assets: [], clips: [], keyboardCaptionSessions: [] });
    await flushPromises();
    expect(state.slices.value).toEqual({});
    expect(waveformWorkerState.instances).toHaveLength(0);
  });

  it('does not publish a result after the composable is unmounted', async () => {
    mountComposable();
    await flushPromises();
    const waveformWorker = worker();
    const coarse = requestFor('clip', waveformWorker, 'coarse');
    if (!coarse) throw new Error('Expected a coarse request.');
    respond(waveformWorker, {
      type: 'result',
      generation: coarse.generation,
      clipId: 'clip',
      resolution: 'coarse',
      peaks: new Float32Array([0, 0.1]),
    });
    await nextTick();
    const request = requestFor('clip', waveformWorker, 'refined');
    if (!request) throw new Error('Expected a refined request.');
    wrapper?.unmount();
    respond(waveformWorker, {
      type: 'result',
      generation: request.generation,
      clipId: 'clip',
      resolution: 'refined',
      peaks: new Float32Array([0, 0.8]),
    });
    await nextTick();

    expect(state.slices.value).toEqual({});
    expect(waveformWorker.terminate).toHaveBeenCalledOnce();
  });
});
