import { computed, onUnmounted, ref, watch } from 'vue';
import { isAudioClip, type ClipComposition } from '~/media/shared/composition-types';
import { extractWaveformPeaks } from '~/media/playback';
import { MediaInputError, mediaSourceDescriptor, type MediaError } from '~/media/shared';

// Audio rows are deliberately taller than the other tracks. Leave headroom so
// real peaks read as a centred waveform instead of a row of tiny top-aligned bars.
const MAX_BAR_HEIGHT = 38;

const pointCountFor = (timelineDurationMs: number, totalDurationSeconds: number) =>
  Math.max(24, Math.min(1_200, Math.round((900 * (timelineDurationMs / 1_000)) / Math.max(1, totalDurationSeconds))));

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

export function useCompositionAudioWaveforms(
  composition: () => ClipComposition,
  timelineDurationSeconds: () => number,
) {
  const rawBars = ref<Record<string, number[]>>({});
  const errors = ref<Record<string, MediaError>>({});
  let generation = 0;

  const bars = computed<Record<string, number[]>>(() => {
    const volumes = new Map(
      composition()
        .clips.filter(isAudioClip)
        .map((clip) => [clip.id, Math.max(0, Math.min(2, clip.volume / 100))]),
    );
    return Object.fromEntries(
      Object.entries(rawBars.value).map(([clipId, heights]) => {
        const gain = volumes.get(clipId) ?? 1;
        return [
          clipId,
          heights.map((height) => (gain <= 0 ? 0 : Math.max(1, Math.min(MAX_BAR_HEIGHT, Math.round(height * gain))))),
        ];
      }),
    );
  });

  const sources = computed(() => {
    const assets = new Map(composition().assets.map((asset) => [asset.id, asset]));
    return composition().clips.flatMap((clip) => {
      if (!isAudioClip(clip)) return [];
      const asset = assets.get(clip.assetId);
      if (!asset?.src) return [];
      return [
        {
          id: clip.id,
          asset,
          sourceInMs: clip.sourceInMs,
          sourceDurationMs: clip.sourceDurationMs,
          timelineDurationMs: clip.timelineDurationMs,
        },
      ];
    });
  });
  const sourceSignature = computed(() =>
    sources.value
      .map(
        (clip) => `${clip.id}:${clip.asset.src}:${clip.sourceInMs}:${clip.sourceDurationMs}:${clip.timelineDurationMs}`,
      )
      .join('|'),
  );

  watch(
    sourceSignature,
    async () => {
      const clips = sources.value;
      const currentGeneration = ++generation;
      const next: Record<string, number[]> = {};
      const nextErrors: Record<string, MediaError> = {};
      await Promise.all(
        clips.map(async (clip) => {
          try {
            const peaks = await extractWaveformPeaks(
              mediaSourceDescriptor(clip.asset),
              clip.sourceInMs / 1_000,
              (clip.sourceInMs + clip.sourceDurationMs) / 1_000,
              pointCountFor(clip.timelineDurationMs, timelineDurationSeconds()),
            );
            next[clip.id] = barsFromPeaks(peaks);
          } catch (error) {
            nextErrors[clip.id] =
              error instanceof MediaInputError
                ? error.detail
                : { kind: 'decode-failure', sourceId: clip.asset.id, message: 'The waveform could not be decoded.' };
            next[clip.id] = [];
          }
        }),
      );
      if (currentGeneration === generation) {
        rawBars.value = next;
        errors.value = nextErrors;
      }
    },
    { immediate: true },
  );

  onUnmounted(() => {
    generation += 1;
  });

  return { bars, errors };
}
