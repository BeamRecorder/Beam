import { computed, onUnmounted, shallowRef, watch, type Ref } from 'vue';
import WaveformWorker from '~/media/playback/waveform.worker?worker';
import { mediaSourceDescriptor } from '~/media/shared';
import type { Clip, MediaAsset } from '~/media/shared/composition-types';
import { assertWaveformWorkerResponse, type WaveformWorkerRequest } from '~/media/playback/waveform-protocol';

const MAX_BAR_HEIGHT = 38;
const MAX_POINTS = 2_048;
type WaveformStatus = 'idle' | 'loading' | 'ready' | 'error';

export function useLinkedClipPreviewWaveform(clip: Ref<Clip>, asset: Ref<MediaAsset | null | undefined>) {
  const bars = shallowRef<number[]>([]);
  const bands = shallowRef(new Float32Array(0));
  const loadingSegments = shallowRef<{ leftPercent: number; widthPercent: number }[]>([]);
  const status = shallowRef<WaveformStatus>('idle');
  const sourceDurationSeconds = computed(() => clip.value.sourceDurationMs / 1_000);
  let worker: Worker | null = null;
  let generation = 0;
  let publishFrame = 0;

  const stop = () => {
    generation += 1;
    cancelAnimationFrame(publishFrame);
    publishFrame = 0;
    if (worker) {
      worker.onmessage = null;
      worker.onerror = null;
      worker.postMessage({ type: 'clear', generation } satisfies WaveformWorkerRequest);
      worker.terminate();
      worker = null;
    }
  };
  const reset = () => {
    stop();
    bars.value = [];
    bands.value = new Float32Array(0);
    loadingSegments.value = [];
    status.value = 'idle';
  };

  watch(
    () => [
      clip.value.id,
      clip.value.kind,
      clip.value.sourceInMs,
      clip.value.sourceDurationMs,
      asset.value?.id,
      asset.value?.src,
    ],
    () => {
      reset();
      const currentClip = clip.value;
      const currentAsset = asset.value;
      if (currentClip.kind !== 'audio' || !currentAsset || !['audio', 'video'].includes(currentAsset.kind)) return;
      const startSeconds = currentClip.sourceInMs / 1_000;
      const endSeconds = (currentClip.sourceInMs + currentClip.sourceDurationMs) / 1_000;
      if (endSeconds <= startSeconds) return;
      const pointCount = Math.max(48, Math.min(MAX_POINTS, Math.ceil(currentClip.timelineDurationMs / 35)));
      const peaks = new Float32Array(pointCount * 2);
      const sourceBands = new Float32Array(pointCount * 4);
      const requestGeneration = generation;
      let receivedPoints = 0;
      status.value = 'loading';
      loadingSegments.value = [{ leftPercent: 0, widthPercent: 100 }];

      const publish = () => {
        publishFrame = 0;
        if (requestGeneration !== generation) return;
        bars.value = Array.from({ length: pointCount }, (_, index) => {
          const amplitude = Math.max(Math.abs(peaks[index * 2]!), Math.abs(peaks[index * 2 + 1]!));
          return amplitude <= 0 ? 0 : Math.max(1, Math.min(MAX_BAR_HEIGHT, amplitude * MAX_BAR_HEIGHT));
        });
        bands.value = sourceBands.slice();
        loadingSegments.value =
          receivedPoints < pointCount
            ? [
                {
                  leftPercent: (receivedPoints / pointCount) * 100,
                  widthPercent: ((pointCount - receivedPoints) / pointCount) * 100,
                },
              ]
            : [];
      };
      const schedulePublish = () => {
        if (!publishFrame) publishFrame = requestAnimationFrame(publish);
      };
      const fail = () => {
        if (requestGeneration !== generation) return;
        cancelAnimationFrame(publishFrame);
        publishFrame = 0;
        status.value = 'error';
        loadingSegments.value = [];
        if (worker) {
          worker.onmessage = null;
          worker.onerror = null;
        }
        worker?.terminate();
        worker = null;
      };
      try {
        worker = new WaveformWorker();
        worker.onmessage = (event: MessageEvent<unknown>) => {
          if (requestGeneration !== generation) return;
          try {
            assertWaveformWorkerResponse(event.data);
          } catch {
            fail();
            return;
          }
          const message = event.data;
          if (message.generation !== requestGeneration || message.clipId !== currentClip.id) return;
          if (message.type === 'error') {
            fail();
            return;
          }
          const chunkPoints = message.peaks.length / 2;
          const chunkEnd = receivedPoints + chunkPoints;
          if (
            message.segmentIndex !== 0 ||
            message.segmentCount !== 1 ||
            message.segmentPointOffset !== receivedPoints ||
            chunkEnd > pointCount ||
            message.segmentComplete !== (chunkEnd === pointCount)
          ) {
            fail();
            return;
          }
          peaks.set(message.peaks, receivedPoints * 2);
          sourceBands.set(message.bands, receivedPoints * 4);
          receivedPoints = chunkEnd;
          schedulePublish();
          if (message.segmentComplete) status.value = 'ready';
        };
        worker.onerror = fail;
        worker.postMessage({
          type: 'extract',
          generation: requestGeneration,
          clipId: currentClip.id,
          source: mediaSourceDescriptor(currentAsset),
          startSeconds,
          endSeconds,
          pointCount,
          segmentIndex: 0,
          segmentCount: 1,
        } satisfies WaveformWorkerRequest);
      } catch {
        fail();
      }
    },
    { immediate: true },
  );
  onUnmounted(stop);

  return { bars, bands, loadingSegments, sourceDurationSeconds, status };
}
