import { computed, onUnmounted, ref, watch } from 'vue';
import WaveformWorker from '~/media/playback/waveform.worker?worker';
import { isAudioClip, type AudioClip, type ClipComposition, type MediaAsset } from '~/media/shared/composition-types';
import { MediaInputError, mediaSourceDescriptor, type MediaError } from '~/media/shared';
import { assertWaveformWorkerResponse, type WaveformWorkerRequest } from '~/media/playback/waveform-protocol';
import { useMediaProcessingReporter } from '../../performance/media-processing-pressure';
import { effectiveAudioClipGain } from '~/media/shared/audio-gain';
import { prepareWaveform, retainWaveform, waveformSourceKey as sourceKey } from './audio-waveform-cache';

import type {
  AudioWaveformViewport,
  AudioWaveformSlice,
  AudioWaveformStatus,
  StoredWaveformSlice,
  WaveformRequest,
  WaveformSegment,
  RefinementBatch,
  PreparedWaveform,
} from './audio-waveform-types';
export type { AudioWaveformViewport, AudioWaveformSlice, AudioWaveformStatus } from './audio-waveform-types';

const MAX_BAR_HEIGHT = 38;
const MAX_POINTS = 1_200;
const PIXELS_PER_POINT = 3;
const WAVEFORM_WORKER_COUNT = 3;
const VIEWPORT_REFINEMENT_DEBOUNCE_MS = 120;

const barsFromPeaks = (peaks: Float32Array) => {
  const count = Math.floor(peaks.length / 2);
  if (count <= 0) return [];
  const amplitudes = new Float32Array(count);
  for (let index = 0; index < count; index += 1) {
    const amplitude = Math.max(Math.abs(peaks[index * 2]!), Math.abs(peaks[index * 2 + 1]!));
    amplitudes[index] = amplitude;
  }
  return Array.from(amplitudes, (amplitude) =>
    amplitude <= 0 ? 0 : Math.max(1, Math.min(MAX_BAR_HEIGHT, amplitude * MAX_BAR_HEIGHT)),
  );
};

const visibleRequest = (
  clip: AudioClip,
  asset: MediaAsset | null,
  viewport: AudioWaveformViewport,
): WaveformRequest | null => {
  const clipStart = clip.timelineStartMs / 1_000;
  const clipEnd = (clip.timelineStartMs + clip.timelineDurationMs) / 1_000;
  const viewportSpan = Math.max(0.001, Math.round((viewport.endSeconds - viewport.startSeconds) * 1_000) / 1_000);
  const viewportPage = Math.floor(viewport.startSeconds / viewportSpan);
  const bufferedStart = Math.max(0, (viewportPage - 1) * viewportSpan);
  const bufferedEnd = (viewportPage + 2) * viewportSpan;
  const start = Math.max(clipStart, bufferedStart);
  const end = Math.min(clipEnd, bufferedEnd);
  if (end <= start || viewport.pixelsPerSecond <= 0) return null;
  const timelineDuration = Math.max(0.001, clipEnd - clipStart);
  const sourceStartSeconds = clip.sourceInMs / 1_000 + (start - clipStart) * clip.playbackRate;
  const sourceLimit = (clip.sourceInMs + clip.sourceDurationMs) / 1_000;
  const sourceEndSeconds = Math.min(sourceLimit, sourceStartSeconds + (end - start) * clip.playbackRate);
  if (sourceEndSeconds <= sourceStartSeconds) return null;
  return {
    clip,
    asset,
    sourceStartSeconds,
    sourceEndSeconds,
    pointCount: Math.max(
      8,
      Math.min(MAX_POINTS, Math.ceil(((end - start) * viewport.pixelsPerSecond) / PIXELS_PER_POINT)),
    ),
    leftPercent: ((start - clipStart) / timelineDuration) * 100,
    widthPercent: ((end - start) / timelineDuration) * 100,
  };
};

export function useCompositionAudioWaveforms(
  composition: () => ClipComposition,
  viewport: () => AudioWaveformViewport,
) {
  const pressure = useMediaProcessingReporter('waveforms', WAVEFORM_WORKER_COUNT);
  const rawSlices = ref<Record<string, StoredWaveformSlice>>({});
  const errors = ref<Record<string, MediaError>>({});
  const status = ref<Record<string, AudioWaveformStatus>>({});
  const workers: Worker[] = [];
  const refinementBatches = new Map<string, RefinementBatch>();
  const waveformCache = new Map<string, StoredWaveformSlice>();
  const pendingPublishes = new Map<
    string,
    {
      request: WaveformRequest;
      peaks: Float32Array;
      bands: Float32Array;
      loadingSegments: AudioWaveformSlice['loadingSegments'];
    }
  >();
  let generation = 0;
  let nextWorkerStart = 0;
  let publishFrame = 0;
  let refinementTimer = 0;
  let currentRequests = new Map<string, WaveformRequest>();

  const updatePressure = () => {
    const pendingSegments = [...refinementBatches.values()].reduce((total, batch) => total + batch.pending.size, 0);
    pressure.update(refinementBatches.size, pendingSegments + pendingPublishes.size);
  };

  const slices = computed<Record<string, AudioWaveformSlice>>(() => {
    const volumes = new Map(
      composition()
        .clips.filter(isAudioClip)
        .map((clip) => [clip.id, effectiveAudioClipGain(clip)]),
    );
    return Object.fromEntries(
      Object.entries(rawSlices.value).map(([clipId, slice]) => {
        const gain = volumes.get(clipId) ?? 1;
        return [
          clipId,
          {
            leftPercent: slice.leftPercent,
            widthPercent: slice.widthPercent,
            loadingSegments: slice.loadingSegments,
            bands: slice.bands,
            sourceDurationSeconds: slice.sourceDurationSeconds,
            bars: slice.bars.map((height) =>
              gain <= 0 || height <= 0 ? 0 : Math.max(1, Math.min(MAX_BAR_HEIGHT, height * gain)),
            ),
          },
        ];
      }),
    );
  });

  const requests = computed(() => {
    const assets = new Map(composition().assets.map((asset) => [asset.id, asset]));
    return composition().clips.flatMap((clip) => {
      if (!isAudioClip(clip) || !clip.enabled) return [];
      const request = visibleRequest(clip, assets.get(clip.assetId) ?? null, viewport());
      return request ? [request] : [];
    });
  });
  const requestSignature = computed(() =>
    requests.value
      .map(
        ({ clip, asset, sourceStartSeconds, sourceEndSeconds, pointCount, leftPercent, widthPercent }) =>
          `${clip.id}:${asset?.id ?? ''}:${asset?.src ?? ''}:${sourceStartSeconds}:${sourceEndSeconds}:${pointCount}:${leftPercent}:${widthPercent}`,
      )
      .join('|'),
  );

  const sliceMatchesRequestRange = (slice: StoredWaveformSlice | undefined, request: WaveformRequest) =>
    slice?.sourceKey === sourceKey(request) &&
    slice.sourceStartSeconds === request.sourceStartSeconds &&
    slice.sourceEndSeconds === request.sourceEndSeconds &&
    slice.leftPercent === request.leftPercent &&
    slice.widthPercent === request.widthPercent;
  const cacheKey = (request: WaveformRequest) =>
    [
      request.clip.id,
      sourceKey(request),
      request.sourceStartSeconds,
      request.sourceEndSeconds,
      request.pointCount,
      request.leftPercent,
      request.widthPercent,
    ].join(':');
  const cacheSlice = (request: WaveformRequest, slice: StoredWaveformSlice) => {
    const key = cacheKey(request);
    waveformCache.delete(key);
    waveformCache.set(key, slice);
    while (waveformCache.size > 32) waveformCache.delete(waveformCache.keys().next().value!);
  };
  const sliceFrom = (
    request: WaveformRequest,
    peaks: Float32Array,
    bands: Float32Array,
    loadingSegments: AudioWaveformSlice['loadingSegments'],
  ): StoredWaveformSlice => ({
    bars: barsFromPeaks(peaks),
    bands: bands.slice(),
    sourceDurationSeconds: request.sourceEndSeconds - request.sourceStartSeconds,
    leftPercent: request.leftPercent,
    widthPercent: request.widthPercent,
    loadingSegments,
    sourceKey: sourceKey(request),
    sourceStartSeconds: request.sourceStartSeconds,
    sourceEndSeconds: request.sourceEndSeconds,
    peaks: peaks.slice(),
  });
  const publish = (
    clipId: string,
    request: WaveformRequest,
    peaks: Float32Array,
    bands: Float32Array,
    loadingSegments: AudioWaveformSlice['loadingSegments'] = [],
  ) => {
    pendingPublishes.set(clipId, { request, peaks, bands, loadingSegments });
    if (publishFrame) return;
    publishFrame = requestAnimationFrame(() => {
      publishFrame = 0;
      const next = { ...rawSlices.value };
      for (const [pendingClipId, pending] of pendingPublishes) {
        next[pendingClipId] = sliceFrom(pending.request, pending.peaks, pending.bands, pending.loadingSegments);
      }
      pendingPublishes.clear();
      rawSlices.value = next;
      updatePressure();
    });
  };

  const fail = (clipId: string, error: MediaError) => {
    refinementBatches.delete(clipId);
    pendingPublishes.delete(clipId);
    rawSlices.value = Object.fromEntries(Object.entries(rawSlices.value).filter(([id]) => id !== clipId));
    errors.value = { ...errors.value, [clipId]: error };
    status.value = { ...status.value, [clipId]: 'error' };
    pressure.error();
    updatePressure();
  };

  const failLoading = (message: string) => {
    for (const [clipId, request] of currentRequests) {
      if (status.value[clipId] !== 'loading') continue;
      fail(clipId, { kind: 'decode-failure', sourceId: request.clip.assetId, message });
    }
  };

  const loadingSegmentsFor = (batch: RefinementBatch) =>
    batch.segments.flatMap((segment) =>
      batch.pending.has(segment.index)
        ? [
            {
              leftPercent:
                ((segment.pointOffset + (batch.receivedPoints.get(segment.index) ?? 0)) / batch.request.pointCount) *
                100,
              widthPercent:
                ((segment.pointCount - (batch.receivedPoints.get(segment.index) ?? 0)) / batch.request.pointCount) *
                100,
            },
          ]
        : [],
    );

  const postSegment = (request: WaveformRequest, segment: WaveformSegment, workerStart: number) => {
    if (!request.asset || workers.length === 0) return;
    const message: WaveformWorkerRequest = {
      type: 'extract',
      generation,
      clipId: request.clip.id,
      source: mediaSourceDescriptor(request.asset),
      startSeconds: segment.startSeconds,
      endSeconds: segment.endSeconds,
      pointCount: segment.pointCount,
      segmentIndex: segment.index,
      segmentCount: segment.count,
    };
    const workerIndex = (workerStart + segment.index) % workers.length;
    workers[workerIndex]!.postMessage(message);
  };

  const beginExtraction = (request: WaveformRequest, prepared: PreparedWaveform, retainVisible: boolean) => {
    const { segments, peaks, bands } = prepared;
    const batch: RefinementBatch = {
      generation,
      request,
      peaks,
      bands,
      segments,
      pending: new Set(segments.map(({ index }) => index)),
      receivedPoints: new Map(segments.map(({ index }) => [index, 0])),
    };
    refinementBatches.set(request.clip.id, batch);
    updatePressure();
    const workerStart = nextWorkerStart++ % workers.length;
    for (const segment of segments) postSegment(request, segment, workerStart);
    if (prepared.reusedPoints && !retainVisible)
      publish(request.clip.id, request, peaks, bands, loadingSegmentsFor(batch));
  };

  const receiveWorkerMessage = (event: MessageEvent<unknown>) => {
    try {
      assertWaveformWorkerResponse(event.data);
    } catch (error) {
      console.error('[Beam media:waveform] Invalid waveform worker response.', error);
      failLoading('Timeline waveform decoding returned an invalid response.');
      return;
    }
    const message = event.data;
    if (message.generation !== generation) return;
    const request = currentRequests.get(message.clipId);
    if (!request) return;
    if (message.type === 'error') {
      fail(message.clipId, message.error);
      return;
    }
    const batch = refinementBatches.get(message.clipId);
    const segment = batch?.segments[message.segmentIndex];
    if (!batch || batch.generation !== generation || !segment || message.segmentCount !== batch.segments.length) return;
    const receivedPoints = batch.receivedPoints.get(segment.index) ?? 0;
    const chunkPoints = message.peaks.length / 2;
    const chunkEnd = message.segmentPointOffset + chunkPoints;
    if (
      !batch.pending.has(segment.index) ||
      message.segmentPointOffset !== receivedPoints ||
      chunkEnd > segment.pointCount ||
      message.segmentComplete !== (chunkEnd === segment.pointCount)
    ) {
      fail(message.clipId, {
        kind: 'decode-failure',
        sourceId: request.clip.assetId,
        message: 'Timeline waveform decoding returned an invalid segment.',
      });
      return;
    }
    batch.peaks.set(message.peaks, (segment.pointOffset + message.segmentPointOffset) * 2);
    batch.bands.set(message.bands, (segment.pointOffset + message.segmentPointOffset) * 4);
    batch.receivedPoints.set(segment.index, chunkEnd);
    if (message.segmentComplete) batch.pending.delete(segment.index);
    const complete = batch.pending.size === 0;
    const visibleSlice = rawSlices.value[message.clipId];
    const isVisibleSliceForRequest =
      sliceMatchesRequestRange(visibleSlice, request) && visibleSlice?.peaks.length === request.pointCount * 2;
    if (complete || !visibleSlice || isVisibleSliceForRequest) {
      publish(message.clipId, request, batch.peaks, batch.bands, loadingSegmentsFor(batch));
    }
    updatePressure();
    if (!complete) return;
    cacheSlice(request, sliceFrom(request, batch.peaks, batch.bands, []));
    refinementBatches.delete(message.clipId);
    status.value = { ...status.value, [message.clipId]: 'ready' };
    updatePressure();
  };

  const initWorkers = () => {
    if (workers.length > 0) return;
    for (let index = 0; index < WAVEFORM_WORKER_COUNT; index += 1) {
      const worker = new WaveformWorker();
      worker.onmessage = receiveWorkerMessage;
      worker.onerror = () => {
        console.error('[Beam media:waveform] Waveform worker crashed.');
        for (const activeWorker of workers) activeWorker.terminate();
        workers.length = 0;
        failLoading('Timeline waveform decoding failed.');
      };
      workers.push(worker);
    }
  };

  const reconcileRequests = () => {
    refinementTimer = 0;
    generation += 1;
    for (const batch of refinementBatches.values()) {
      if ([...batch.receivedPoints.values()].some((count) => count > 0)) {
        cacheSlice(batch.request, sliceFrom(batch.request, batch.peaks, batch.bands, loadingSegmentsFor(batch)));
      }
    }
    refinementBatches.clear();
    pendingPublishes.clear();
    updatePressure();
    cancelAnimationFrame(publishFrame);
    publishFrame = 0;
    const active = requests.value;
    currentRequests = new Map(active.map((request) => [request.clip.id, request]));
    const nextSlices: Record<string, StoredWaveformSlice> = {};
    errors.value = {};
    const nextStatus: Record<string, AudioWaveformStatus> = {};
    for (const worker of workers) worker.postMessage({ type: 'clear', generation } satisfies WaveformWorkerRequest);
    for (const request of active) {
      if (!request.asset) {
        const error = new MediaInputError({
          kind: 'missing',
          sourceId: request.clip.assetId,
          message: 'The waveform source asset is missing.',
        });
        fail(request.clip.id, error.detail);
        nextStatus[request.clip.id] = 'error';
        continue;
      }
      const cached = waveformCache.get(cacheKey(request));
      if (cached && !cached.loadingSegments.length) {
        waveformCache.delete(cacheKey(request));
        waveformCache.set(cacheKey(request), cached);
        nextSlices[request.clip.id] = cached;
        nextStatus[request.clip.id] = 'ready';
        continue;
      }
      const prepared = prepareWaveform(request, waveformCache.values(), WAVEFORM_WORKER_COUNT);
      if (!prepared.segments.length) {
        const reused = sliceFrom(request, prepared.peaks, prepared.bands, []);
        nextSlices[request.clip.id] = reused;
        nextStatus[request.clip.id] = 'ready';
        // Keep original finer bins in the cache: zooming out must not evict their detail.
        continue;
      }
      const visibleSlice = retainWaveform(rawSlices.value[request.clip.id], request);
      if (visibleSlice) {
        nextSlices[request.clip.id] = visibleSlice;
      }
      nextStatus[request.clip.id] = 'loading';
      try {
        initWorkers();
        beginExtraction(request, prepared, Boolean(visibleSlice));
      } catch (error) {
        fail(request.clip.id, {
          kind: 'decode-failure',
          sourceId: request.clip.assetId,
          message: error instanceof Error ? error.message : 'The waveform request could not be created.',
        });
        nextStatus[request.clip.id] = 'error';
      }
    }
    rawSlices.value = nextSlices;
    status.value = nextStatus;
    updatePressure();
  };

  watch(
    requestSignature,
    () => {
      window.clearTimeout(refinementTimer);
      const active = requests.value;
      const canKeepEveryVisibleWaveform =
        active.length > 0 && active.every((request) => retainWaveform(rawSlices.value[request.clip.id], request));
      if (canKeepEveryVisibleWaveform) {
        refinementTimer = window.setTimeout(reconcileRequests, VIEWPORT_REFINEMENT_DEBOUNCE_MS);
        return;
      }
      reconcileRequests();
    },
    { immediate: true },
  );

  onUnmounted(() => {
    generation += 1;
    refinementBatches.clear();
    pendingPublishes.clear();
    cancelAnimationFrame(publishFrame);
    window.clearTimeout(refinementTimer);
    currentRequests.clear();
    rawSlices.value = {};
    errors.value = {};
    status.value = {};
    for (const worker of workers) {
      worker.postMessage({ type: 'clear', generation } satisfies WaveformWorkerRequest);
      worker.terminate();
    }
    workers.length = 0;
    pressure.dispose();
  });

  return { slices, errors, status };
}
