import { computed, onUnmounted, ref, watch } from 'vue';
import WaveformWorker from '~/media/playback/waveform.worker?worker';
import { isAudioClip, type AudioClip, type ClipComposition, type MediaAsset } from '~/media/shared/composition-types';
import { MediaInputError, mediaSourceDescriptor, type MediaError } from '~/media/shared';
import { assertWaveformWorkerResponse, type WaveformWorkerRequest } from '~/media/playback/waveform-protocol';

const MAX_BAR_HEIGHT = 38;
const MAX_POINTS = 1_200;
const PIXELS_PER_POINT = 3;
const WAVEFORM_WORKER_COUNT = 3;

export interface AudioWaveformViewport {
  startSeconds: number;
  endSeconds: number;
  pixelsPerSecond: number;
}

export interface AudioWaveformSlice {
  bars: number[];
  leftPercent: number;
  widthPercent: number;
  loadingSegments: Array<{ leftPercent: number; widthPercent: number }>;
}

export type AudioWaveformStatus = 'idle' | 'loading' | 'ready' | 'error';

type StoredWaveformSlice = AudioWaveformSlice & {
  sourceKey: string;
  sourceStartSeconds: number;
  sourceEndSeconds: number;
  peaks: Float32Array;
};

type WaveformRequest = {
  clip: AudioClip;
  asset: MediaAsset | null;
  sourceStartSeconds: number;
  sourceEndSeconds: number;
  pointCount: number;
  leftPercent: number;
  widthPercent: number;
};

type WaveformSegment = {
  index: number;
  count: number;
  pointOffset: number;
  pointCount: number;
  startSeconds: number;
  endSeconds: number;
};

type RefinementBatch = {
  generation: number;
  request: WaveformRequest;
  peaks: Float32Array;
  segments: WaveformSegment[];
  pending: Set<number>;
  receivedPoints: Map<number, number>;
};

const barsFromPeaks = (peaks: Float32Array) => {
  const count = Math.floor(peaks.length / 2);
  if (count <= 0) return [];
  const amplitudes = new Float32Array(count);
  for (let index = 0; index < count; index += 1) {
    const amplitude = Math.max(0, peaks[index * 2 + 1] - peaks[index * 2]);
    amplitudes[index] = amplitude;
  }
  return Array.from(amplitudes, (amplitude) =>
    amplitude <= 0 ? 0 : Math.max(1, Math.min(MAX_BAR_HEIGHT, Math.round((amplitude * MAX_BAR_HEIGHT) / 2))),
  );
};

const waveformSegments = (request: WaveformRequest, count: number): WaveformSegment[] => {
  const segmentCount = Math.max(1, Math.min(count, request.pointCount));
  const duration = request.sourceEndSeconds - request.sourceStartSeconds;
  let pointOffset = 0;
  return Array.from({ length: segmentCount }, (_, index) => {
    const pointCount =
      Math.floor(request.pointCount / segmentCount) + (index < request.pointCount % segmentCount ? 1 : 0);
    const startOffset = pointOffset;
    pointOffset += pointCount;
    return {
      index,
      count: segmentCount,
      pointOffset: startOffset,
      pointCount,
      startSeconds: request.sourceStartSeconds + duration * (startOffset / request.pointCount),
      endSeconds: request.sourceStartSeconds + duration * (pointOffset / request.pointCount),
    };
  });
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
  const rawSlices = ref<Record<string, StoredWaveformSlice>>({});
  const errors = ref<Record<string, MediaError>>({});
  const status = ref<Record<string, AudioWaveformStatus>>({});
  const workers: Worker[] = [];
  const refinementBatches = new Map<string, RefinementBatch>();
  const waveformCache = new Map<string, StoredWaveformSlice>();
  const pendingPublishes = new Map<
    string,
    { request: WaveformRequest; peaks: Float32Array; loadingSegments: AudioWaveformSlice['loadingSegments'] }
  >();
  let generation = 0;
  let nextWorkerStart = 0;
  let publishFrame = 0;
  let currentRequests = new Map<string, WaveformRequest>();

  const slices = computed<Record<string, AudioWaveformSlice>>(() => {
    const volumes = new Map(
      composition()
        .clips.filter(isAudioClip)
        .map((clip) => [clip.id, Math.max(0, Math.min(2, clip.volume / 100))]),
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
            bars: slice.bars.map((height) =>
              gain <= 0 || height <= 0 ? 0 : Math.max(1, Math.min(MAX_BAR_HEIGHT, Math.round(height * gain))),
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
        ({ clip, asset, sourceStartSeconds, sourceEndSeconds, pointCount }) =>
          `${clip.id}:${asset?.src ?? ''}:${sourceStartSeconds}:${sourceEndSeconds}:${pointCount}`,
      )
      .join('|'),
  );

  const sourceKey = (request: WaveformRequest) => `${request.asset?.id ?? ''}:${request.asset?.src ?? ''}`;
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
    loadingSegments: AudioWaveformSlice['loadingSegments'],
  ): StoredWaveformSlice => ({
    bars: barsFromPeaks(peaks),
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
    loadingSegments: AudioWaveformSlice['loadingSegments'] = [],
  ) => {
    pendingPublishes.set(clipId, { request, peaks, loadingSegments });
    if (publishFrame) return;
    publishFrame = requestAnimationFrame(() => {
      publishFrame = 0;
      const next = { ...rawSlices.value };
      for (const [pendingClipId, pending] of pendingPublishes) {
        next[pendingClipId] = sliceFrom(pending.request, pending.peaks, pending.loadingSegments);
      }
      pendingPublishes.clear();
      rawSlices.value = next;
    });
  };

  const fail = (clipId: string, error: MediaError) => {
    refinementBatches.delete(clipId);
    pendingPublishes.delete(clipId);
    rawSlices.value = Object.fromEntries(Object.entries(rawSlices.value).filter(([id]) => id !== clipId));
    errors.value = { ...errors.value, [clipId]: error };
    status.value = { ...status.value, [clipId]: 'error' };
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

  const beginExtraction = (request: WaveformRequest) => {
    const segments = waveformSegments(request, WAVEFORM_WORKER_COUNT);
    const batch: RefinementBatch = {
      generation,
      request,
      peaks: new Float32Array(request.pointCount * 2),
      segments,
      pending: new Set(segments.map(({ index }) => index)),
      receivedPoints: new Map(segments.map(({ index }) => [index, 0])),
    };
    refinementBatches.set(request.clip.id, batch);
    const workerStart = nextWorkerStart++ % workers.length;
    for (const segment of segments) postSegment(request, segment, workerStart);
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
    batch.receivedPoints.set(segment.index, chunkEnd);
    if (message.segmentComplete) batch.pending.delete(segment.index);
    const complete = batch.pending.size === 0;
    publish(message.clipId, request, batch.peaks, loadingSegmentsFor(batch));
    if (!complete) return;
    cacheSlice(request, sliceFrom(request, batch.peaks, []));
    refinementBatches.delete(message.clipId);
    status.value = { ...status.value, [message.clipId]: 'ready' };
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

  watch(
    requestSignature,
    () => {
      generation += 1;
      refinementBatches.clear();
      pendingPublishes.clear();
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
        if (cached) {
          waveformCache.delete(cacheKey(request));
          waveformCache.set(cacheKey(request), cached);
          nextSlices[request.clip.id] = cached;
          nextStatus[request.clip.id] = 'ready';
          continue;
        }
        nextStatus[request.clip.id] = 'loading';
        try {
          initWorkers();
          beginExtraction(request);
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
    },
    { immediate: true },
  );

  onUnmounted(() => {
    generation += 1;
    refinementBatches.clear();
    pendingPublishes.clear();
    cancelAnimationFrame(publishFrame);
    currentRequests.clear();
    rawSlices.value = {};
    errors.value = {};
    status.value = {};
    for (const worker of workers) {
      worker.postMessage({ type: 'clear', generation } satisfies WaveformWorkerRequest);
      worker.terminate();
    }
    workers.length = 0;
  });

  return { slices, errors, status };
}
