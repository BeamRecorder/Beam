import { onBeforeUnmount, reactive, type Ref } from 'vue';
import AudioNormalizationWorker from '~/media/audio/audio-normalization.worker?worker';
import { audioAnalysisKey, normalizationFromAnalysis } from '~/media/audio/audio-normalization';
import type {
  AudioNormalizationWorkerRequest,
  AudioNormalizationWorkerResponse,
} from '~/media/audio/audio-normalization-worker-types';
import { isAudioClip, mediaSourceDescriptor, type ClipComposition } from '~/media/shared';
import type { AudioAnalysis } from '~/media/shared/audio-normalization-types';
import { setAudioNormalization } from '../composition/engine/clip-engine';

export type AudioNormalizationStatus = 'analyzing' | 'ready' | 'silent' | 'error';

export function useAudioNormalization(options: { composition: Ref<ClipComposition>; onCommit: () => void }) {
  let worker: InstanceType<typeof AudioNormalizationWorker> | null = null;
  const pending = new Map<string, { resolve: (analysis: AudioAnalysis) => void; reject: (error: Error) => void }>();
  const statuses = reactive<Record<string, AudioNormalizationStatus | undefined>>({});
  const errors = reactive<Record<string, string | undefined>>({});

  const ensureWorker = () => {
    if (worker) return worker;
    const created = new AudioNormalizationWorker();
    created.onmessage = (event: MessageEvent<AudioNormalizationWorkerResponse>) => {
      const request = pending.get(event.data.requestId);
      if (!request) return;
      pending.delete(event.data.requestId);
      if (event.data.type === 'result') request.resolve(event.data.analysis);
      else request.reject(new Error(event.data.message));
    };
    created.onerror = () => {
      for (const request of pending.values()) request.reject(new Error('Audio analysis worker crashed.'));
      pending.clear();
    };
    worker = created;
    return created;
  };

  const analyze = (request: Omit<AudioNormalizationWorkerRequest, 'type' | 'requestId'>) =>
    new Promise<AudioAnalysis>((resolve, reject) => {
      const requestId = crypto.randomUUID();
      pending.set(requestId, { resolve, reject });
      ensureWorker().postMessage({ type: 'analyze', requestId, ...request } satisfies AudioNormalizationWorkerRequest);
    });

  const normalizeClipIds = async (clipIds: readonly string[]) => {
    const targets = [...new Set(clipIds)];
    let next = options.composition.value;
    let changed = false;
    for (const clipId of targets) {
      let targetChanged = false;
      const initialClip = next.clips.find((clip) => clip.id === clipId);
      if (!initialClip || initialClip.locked || !isAudioClip(initialClip)) continue;
      const asset = next.assets.find((entry) => entry.id === initialClip.assetId);
      if (!asset) continue;
      const key = audioAnalysisKey(asset.id, initialClip.sourceInMs, initialClip.sourceDurationMs);
      statuses[clipId] = 'analyzing';
      errors[clipId] = undefined;
      try {
        const cached = asset.audioAnalyses?.find((analysis) => analysis.key === key);
        const analysis =
          cached ??
          (await analyze({
            source: mediaSourceDescriptor(asset),
            rangeStartMs: initialClip.sourceInMs,
            rangeDurationMs: initialClip.sourceDurationMs,
            analysisKey: key,
          }));
        next = options.composition.value;
        const currentClip = next.clips.find((clip) => clip.id === clipId);
        if (
          !currentClip ||
          currentClip.locked ||
          !isAudioClip(currentClip) ||
          currentClip.assetId !== initialClip.assetId ||
          currentClip.sourceInMs !== initialClip.sourceInMs ||
          currentClip.sourceDurationMs !== initialClip.sourceDurationMs
        ) {
          statuses[clipId] = undefined;
          continue;
        }
        if (!cached) {
          next = {
            ...next,
            assets: next.assets.map((entry) =>
              entry.id === asset.id
                ? {
                    ...entry,
                    audioAnalyses: [...(entry.audioAnalyses ?? []).filter((item) => item.key !== key), analysis].slice(
                      -64,
                    ),
                  }
                : entry,
            ),
          };
          changed = true;
          targetChanged = true;
        }
        const normalization = normalizationFromAnalysis(analysis);
        if (!normalization) {
          statuses[clipId] = 'silent';
          if (targetChanged) options.composition.value = next;
          continue;
        }
        next = setAudioNormalization(next, clipId, normalization);
        statuses[clipId] = 'ready';
        changed = true;
        options.composition.value = next;
      } catch (error) {
        statuses[clipId] = 'error';
        errors[clipId] = error instanceof Error ? error.message : String(error);
      }
    }
    if (changed) {
      options.composition.value = next;
      options.onCommit();
    }
  };

  const resetClipIds = (clipIds: readonly string[]) => {
    let next = options.composition.value;
    let changed = false;
    for (const clipId of new Set(clipIds)) {
      const clip = next.clips.find((entry) => entry.id === clipId);
      if (!clip || clip.locked || !isAudioClip(clip) || !clip.normalization) continue;
      next = setAudioNormalization(next, clipId, undefined);
      statuses[clipId] = undefined;
      errors[clipId] = undefined;
      changed = true;
    }
    if (!changed) return;
    options.composition.value = next;
    options.onCommit();
  };

  onBeforeUnmount(() => {
    worker?.terminate();
    for (const request of pending.values()) request.reject(new Error('Audio analysis was cancelled.'));
    pending.clear();
  });

  return { errors, normalizeClipIds, resetClipIds, statuses };
}
