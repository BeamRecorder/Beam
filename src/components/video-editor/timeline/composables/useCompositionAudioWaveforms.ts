import { computed, onUnmounted, ref, watch } from 'vue';
import WaveformWorker from '~/media/playback/waveform.worker?worker';
import { isAudioClip, type AudioClip, type ClipComposition, type MediaAsset } from '~/media/shared/composition-types';
import { MediaInputError, mediaSourceDescriptor, type MediaError } from '~/media/shared';
import {
  assertWaveformWorkerResponse,
  type WaveformResolution,
  type WaveformWorkerRequest,
} from '~/media/playback/waveform-protocol';

const MAX_BAR_HEIGHT = 38;
const MAX_POINTS = 1_200;
const COARSE_POINTS = 64;
const PIXELS_PER_POINT = 3;

export interface AudioWaveformViewport {
  startSeconds: number;
  endSeconds: number;
  pixelsPerSecond: number;
}

export interface AudioWaveformSlice {
  bars: number[];
  leftPercent: number;
  widthPercent: number;
}

export type AudioWaveformStatus = 'idle' | 'loading' | 'ready' | 'error';

type WaveformRequest = {
  clip: AudioClip;
  asset: MediaAsset | null;
  sourceStartSeconds: number;
  sourceEndSeconds: number;
  pointCount: number;
  leftPercent: number;
  widthPercent: number;
};

const barsFromPeaks = (peaks: Float32Array) => {
  const count = Math.floor(peaks.length / 2);
  if (count <= 0) return [];
  const amplitudes = new Float32Array(count);
  let maximum = 0.0001;
  for (let index = 0; index < count; index += 1) {
    const amplitude = Math.max(0, peaks[index * 2 + 1] - peaks[index * 2]);
    amplitudes[index] = amplitude;
    maximum = Math.max(maximum, amplitude);
  }
  const scale = maximum > 0.01 ? MAX_BAR_HEIGHT / maximum : MAX_BAR_HEIGHT * 5;
  return Array.from(amplitudes, (amplitude) => Math.max(3, Math.min(MAX_BAR_HEIGHT, Math.round(amplitude * scale))));
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
  const rawSlices = ref<Record<string, AudioWaveformSlice>>({});
  const errors = ref<Record<string, MediaError>>({});
  const status = ref<Record<string, AudioWaveformStatus>>({});
  let worker: Worker | null = null;
  let generation = 0;
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
            ...slice,
            bars: slice.bars.map((height) =>
              gain <= 0 ? 0 : Math.max(1, Math.min(MAX_BAR_HEIGHT, Math.round(height * gain))),
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

  const publish = (clipId: string, request: WaveformRequest, peaks: Float32Array) => {
    rawSlices.value = {
      ...rawSlices.value,
      [clipId]: { bars: barsFromPeaks(peaks), leftPercent: request.leftPercent, widthPercent: request.widthPercent },
    };
  };

  const fail = (clipId: string, error: MediaError) => {
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

  const postExtract = (request: WaveformRequest, resolution: WaveformResolution) => {
    if (!request.asset || !worker) return;
    const pointCount = resolution === 'coarse' ? Math.min(COARSE_POINTS, request.pointCount) : request.pointCount;
    const message: WaveformWorkerRequest = {
      type: 'extract',
      generation,
      clipId: request.clip.id,
      source: mediaSourceDescriptor(request.asset),
      startSeconds: request.sourceStartSeconds,
      endSeconds: request.sourceEndSeconds,
      pointCount,
      resolution,
    };
    worker.postMessage(message);
  };

  const initWorker = () => {
    if (worker) return;
    worker = new WaveformWorker();
    worker.onmessage = (event: MessageEvent<unknown>) => {
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
      publish(message.clipId, request, message.peaks);
      const coarseCount = Math.min(COARSE_POINTS, request.pointCount);
      if (message.resolution === 'coarse' && request.pointCount > coarseCount) {
        postExtract(request, 'refined');
        return;
      }
      status.value = { ...status.value, [message.clipId]: 'ready' };
    };
    worker.onerror = () => {
      console.error('[Beam media:waveform] Waveform worker crashed.');
      failLoading('Timeline waveform decoding failed.');
    };
  };

  watch(
    requestSignature,
    () => {
      generation += 1;
      const active = requests.value;
      currentRequests = new Map(active.map((request) => [request.clip.id, request]));
      const activeIds = new Set(active.map(({ clip }) => clip.id));
      rawSlices.value = Object.fromEntries(Object.entries(rawSlices.value).filter(([clipId]) => activeIds.has(clipId)));
      errors.value = {};
      status.value = Object.fromEntries(active.map(({ clip }) => [clip.id, 'loading' as const]));
      worker?.postMessage({ type: 'clear', generation } satisfies WaveformWorkerRequest);
      for (const request of active) {
        if (!request.asset) {
          const error = new MediaInputError({
            kind: 'missing',
            sourceId: request.clip.assetId,
            message: 'The waveform source asset is missing.',
          });
          fail(request.clip.id, error.detail);
          continue;
        }
        try {
          initWorker();
          postExtract(request, 'coarse');
        } catch (error) {
          fail(request.clip.id, {
            kind: 'decode-failure',
            sourceId: request.clip.assetId,
            message: error instanceof Error ? error.message : 'The waveform request could not be created.',
          });
        }
      }
    },
    { immediate: true },
  );

  onUnmounted(() => {
    generation += 1;
    currentRequests.clear();
    rawSlices.value = {};
    errors.value = {};
    status.value = {};
    worker?.postMessage({ type: 'clear', generation } satisfies WaveformWorkerRequest);
    worker?.terminate();
  });

  return { slices, errors, status };
}
