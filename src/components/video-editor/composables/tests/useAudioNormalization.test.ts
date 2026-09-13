import { ref, type Ref } from 'vue';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { AudioNormalizationWorkerResponse } from '~/media/audio/audio-normalization-worker-types';
import { AUDIO_ANALYSIS_VERSION, type AudioAnalysis } from '~/media/shared/audio-normalization-types';
import { createComposition } from '../../composition/engine/clip-engine';
import type { AudioClip, ClipComposition, MediaAsset } from '~/media/shared/composition-types';

const workerState = vi.hoisted(() => {
  const instances: FakeWorker[] = [];

  class FakeWorker {
    onmessage: ((event: MessageEvent<AudioNormalizationWorkerResponse>) => void) | null = null;
    onerror: (() => void) | null = null;
    readonly requests: unknown[] = [];
    readonly terminate = vi.fn();

    constructor() {
      instances.push(this);
    }

    postMessage(message: unknown) {
      this.requests.push(message);
    }

    respond(message: AudioNormalizationWorkerResponse) {
      this.onmessage?.({ data: message } as MessageEvent<AudioNormalizationWorkerResponse>);
    }

    fail() {
      this.onerror?.();
    }
  }

  return { FakeWorker, instances };
});

vi.mock('~/media/audio/audio-normalization.worker?worker', () => ({ default: workerState.FakeWorker }));

const asset = (): MediaAsset => ({
  id: 'asset-1',
  kind: 'audio',
  name: 'Narration',
  fileName: 'narration.opus',
  durationMs: 1_000,
  width: null,
  height: null,
  src: 'project-media://asset-1',
  origin: 'project',
});

const clip = (overrides: Partial<AudioClip> = {}): AudioClip => ({
  id: 'clip-1',
  kind: 'audio',
  name: 'Narration',
  timelineStartMs: 0,
  timelineDurationMs: 1_000,
  sourceInMs: 0,
  sourceDurationMs: 1_000,
  playbackRate: 1,
  transitions: { entry: null, exit: null },
  enabled: true,
  order: 0,
  assetId: 'asset-1',
  role: 'voiceover',
  volume: 100,
  ...overrides,
});

const composition = (clipOverrides: Partial<AudioClip> = {}, analyses: AudioAnalysis[] = []): Ref<ClipComposition> =>
  ref(createComposition([{ ...asset(), audioAnalyses: analyses }], [clip(clipOverrides)]));

const analysis = (overrides: Partial<AudioAnalysis> = {}): AudioAnalysis => ({
  version: AUDIO_ANALYSIS_VERSION,
  key: 'asset-1:0:1000:v1',
  rangeStartMs: 0,
  rangeDurationMs: 1_000,
  sampleRate: 48_000,
  channels: 1,
  integratedLufs: -20,
  samplePeakDbfs: -3,
  truePeakDbtp: -2,
  ...overrides,
});

const workerRequest = (worker: InstanceType<typeof workerState.FakeWorker>) =>
  worker.requests[0] as { requestId: string; rangeStartMs: number; rangeDurationMs: number; analysisKey: string };
const firstAudioClip = (state: Ref<ClipComposition>) => state.value.clips[0] as AudioClip;
const audioClipById = (state: Ref<ClipComposition>, id: string) =>
  state.value.clips.find((entry) => entry.id === id) as AudioClip;

describe('useAudioNormalization', () => {
  beforeEach(() => {
    workerState.instances.length = 0;
  });

  it('uses a cached analysis without creating a Worker', async () => {
    const state = composition({}, [analysis()]);
    const onCommit = vi.fn();
    const normalization = (await import('../useAudioNormalization')).useAudioNormalization({
      composition: state,
      onCommit,
    });

    await normalization.normalizeClipIds(['clip-1']);

    expect(workerState.instances).toHaveLength(0);
    expect(state.value.clips[0]).toMatchObject({ normalization: { enabled: true, appliedGainDb: 1 } });
    expect(normalization.statuses['clip-1']).toBe('ready');
    expect(onCommit).toHaveBeenCalledOnce();
  });

  it('skips a locked clip before starting analysis', async () => {
    const state = composition({ locked: true });
    const onCommit = vi.fn();
    const normalization = (await import('../useAudioNormalization')).useAudioNormalization({
      composition: state,
      onCommit,
    });

    await normalization.normalizeClipIds(['clip-1']);

    expect(workerState.instances).toHaveLength(0);
    expect(firstAudioClip(state).normalization).toBeUndefined();
    expect(normalization.statuses['clip-1']).toBeUndefined();
    expect(onCommit).not.toHaveBeenCalled();
  });

  it('analyzes a cache miss and stores the result on the asset', async () => {
    const state = composition();
    const onCommit = vi.fn();
    const normalization = (await import('../useAudioNormalization')).useAudioNormalization({
      composition: state,
      onCommit,
    });
    const pending = normalization.normalizeClipIds(['clip-1']);
    const worker = workerState.instances[0]!;
    const request = workerRequest(worker);

    expect(request).toMatchObject({ rangeStartMs: 0, rangeDurationMs: 1_000, analysisKey: analysis().key });
    worker.respond({ type: 'result', requestId: request.requestId, analysis: analysis() });
    await pending;

    expect(state.value.assets[0]?.audioAnalyses).toEqual([analysis()]);
    expect(firstAudioClip(state).normalization).toMatchObject({ enabled: true, analysisKey: analysis().key });
    expect(normalization.statuses['clip-1']).toBe('ready');
    expect(onCommit).toHaveBeenCalledOnce();
  });

  it('retains both normalizations and caches across successive asynchronous analyses', async () => {
    const firstAsset = asset();
    const secondAsset = { ...asset(), id: 'asset-2', name: 'Second narration', src: 'project-media://asset-2' };
    const state = ref(
      createComposition(
        [firstAsset, secondAsset],
        [clip(), clip({ id: 'clip-2', assetId: 'asset-2', name: 'Second narration', order: 1 })],
      ),
    );
    const onCommit = vi.fn();
    const normalization = (await import('../useAudioNormalization')).useAudioNormalization({
      composition: state,
      onCommit,
    });
    const pending = normalization.normalizeClipIds(['clip-1', 'clip-2']);
    const worker = workerState.instances[0]!;
    const firstRequest = workerRequest(worker);

    expect(firstRequest).toMatchObject({
      analysisKey: 'asset-1:0:1000:v1',
      source: { assetId: 'asset-1' },
    });
    worker.respond({ type: 'result', requestId: firstRequest.requestId, analysis: analysis() });
    await Promise.resolve();
    await Promise.resolve();

    const secondRequest = worker.requests[1] as {
      requestId: string;
      analysisKey: string;
      source: { assetId: string };
    };
    expect(secondRequest).toMatchObject({
      analysisKey: 'asset-2:0:1000:v1',
      source: { assetId: 'asset-2' },
    });
    worker.respond({
      type: 'result',
      requestId: secondRequest.requestId,
      analysis: analysis({ key: 'asset-2:0:1000:v1' }),
    });
    await pending;

    expect(audioClipById(state, 'clip-1').normalization).toMatchObject({ enabled: true });
    expect(audioClipById(state, 'clip-2').normalization).toMatchObject({ enabled: true });
    expect(state.value.assets.find((entry) => entry.id === 'asset-1')?.audioAnalyses).toEqual([analysis()]);
    expect(state.value.assets.find((entry) => entry.id === 'asset-2')?.audioAnalyses).toEqual([
      analysis({ key: 'asset-2:0:1000:v1' }),
    ]);
    expect(onCommit).toHaveBeenCalledOnce();
  });

  it('discards an analysis result when the clip range changed while it was pending', async () => {
    const state = composition();
    const onCommit = vi.fn();
    const normalization = (await import('../useAudioNormalization')).useAudioNormalization({
      composition: state,
      onCommit,
    });
    const pending = normalization.normalizeClipIds(['clip-1']);
    const worker = workerState.instances[0]!;
    const request = workerRequest(worker);

    state.value = createComposition(state.value.assets, [
      clip({ sourceInMs: 200, sourceDurationMs: 800, timelineDurationMs: 800 }),
    ]);
    worker.respond({ type: 'result', requestId: request.requestId, analysis: analysis() });
    await pending;

    expect(firstAudioClip(state).normalization).toBeUndefined();
    expect(state.value.assets[0]?.audioAnalyses).toEqual([]);
    expect(normalization.statuses['clip-1']).toBeUndefined();
    expect(onCommit).not.toHaveBeenCalled();
  });

  it('discards an analysis result when the clip becomes locked while it is pending', async () => {
    const state = composition();
    const onCommit = vi.fn();
    const normalization = (await import('../useAudioNormalization')).useAudioNormalization({
      composition: state,
      onCommit,
    });
    const pending = normalization.normalizeClipIds(['clip-1']);
    const worker = workerState.instances[0]!;
    const request = workerRequest(worker);

    state.value = createComposition(state.value.assets, [clip({ locked: true })]);
    worker.respond({ type: 'result', requestId: request.requestId, analysis: analysis() });
    await pending;

    expect(firstAudioClip(state).locked).toBe(true);
    expect(firstAudioClip(state).normalization).toBeUndefined();
    expect(state.value.assets[0]?.audioAnalyses).toEqual([]);
    expect(normalization.statuses['clip-1']).toBeUndefined();
    expect(onCommit).not.toHaveBeenCalled();
  });

  it('uses a cached silent result and leaves the clip unchanged', async () => {
    const state = composition({}, [analysis({ integratedLufs: null, samplePeakDbfs: null, truePeakDbtp: null })]);
    const onCommit = vi.fn();
    const normalization = (await import('../useAudioNormalization')).useAudioNormalization({
      composition: state,
      onCommit,
    });

    await normalization.normalizeClipIds(['clip-1']);

    expect(workerState.instances).toHaveLength(0);
    expect(firstAudioClip(state).normalization).toBeUndefined();
    expect(normalization.statuses['clip-1']).toBe('silent');
    expect(onCommit).not.toHaveBeenCalled();
  });

  it('reports a Worker analysis error without committing composition changes', async () => {
    const state = composition();
    const onCommit = vi.fn();
    const normalization = (await import('../useAudioNormalization')).useAudioNormalization({
      composition: state,
      onCommit,
    });
    const pending = normalization.normalizeClipIds(['clip-1']);
    const worker = workerState.instances[0]!;
    const request = workerRequest(worker);

    worker.respond({ type: 'error', requestId: request.requestId, message: 'decode failed' });
    await pending;

    expect(firstAudioClip(state).normalization).toBeUndefined();
    expect(normalization.statuses['clip-1']).toBe('error');
    expect(normalization.errors['clip-1']).toBe('decode failed');
    expect(onCommit).not.toHaveBeenCalled();
  });

  it('resets an existing normalization and commits the changed composition', async () => {
    const state = composition({
      normalization: {
        enabled: true,
        mode: 'lufs',
        targetLufs: -16,
        targetPeakDbtp: -1,
        appliedGainDb: 1,
        analysisVersion: AUDIO_ANALYSIS_VERSION,
        analysisKey: analysis().key,
      },
    });
    const onCommit = vi.fn();
    const normalization = (await import('../useAudioNormalization')).useAudioNormalization({
      composition: state,
      onCommit,
    });

    normalization.resetClipIds(['clip-1']);

    expect(firstAudioClip(state).normalization).toBeUndefined();
    expect(normalization.statuses['clip-1']).toBeUndefined();
    expect(normalization.errors['clip-1']).toBeUndefined();
    expect(onCommit).toHaveBeenCalledOnce();
    expect(workerState.instances).toHaveLength(0);
  });

  it('keeps a locked normalization when reset is requested', async () => {
    const existingNormalization = {
      enabled: true,
      mode: 'lufs' as const,
      targetLufs: -16,
      targetPeakDbtp: -1,
      appliedGainDb: 1,
      analysisVersion: AUDIO_ANALYSIS_VERSION,
      analysisKey: analysis().key,
    };
    const state = composition({ locked: true, normalization: existingNormalization });
    const onCommit = vi.fn();
    const normalization = (await import('../useAudioNormalization')).useAudioNormalization({
      composition: state,
      onCommit,
    });

    normalization.resetClipIds(['clip-1']);

    expect(firstAudioClip(state).normalization).toEqual(existingNormalization);
    expect(normalization.statuses['clip-1']).toBeUndefined();
    expect(normalization.errors['clip-1']).toBeUndefined();
    expect(onCommit).not.toHaveBeenCalled();
    expect(workerState.instances).toHaveLength(0);
  });
});
