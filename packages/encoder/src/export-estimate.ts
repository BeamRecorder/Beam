import { bitrateFor } from './export-presets';
import type { ExportEstimateInput } from './export-estimate-types';
import { isAudioClip, type ClipComposition } from '@beam/engine/shared/composition-types';
import { mayBeEnabled } from '@beam/engine/scene/scene-visibility';

export const EXPORT_AUDIO_BITRATE = 128_000;

/** Match both exporters, including audio whose visibility is animated. */
export function hasExportAudio(composition: ClipComposition): boolean {
  return composition.clips.some(
    (clip) => isAudioClip(clip) && mayBeEnabled(composition, clip) && clip.timelineDurationMs > 0,
  );
}

/**
 * Nominal payload at the encoder's target bitrates, not a measured prediction or
 * an upper bound. Variable bitrate can use far less for simple scenes; codecs
 * and container overhead can also make the final file larger.
 */
export function estimatedExportBytes(input: ExportEstimateInput): number | null {
  if ([input.duration, input.width, input.height, input.fps].some((value) => !Number.isFinite(value) || value <= 0))
    return null;
  const video = bitrateFor(input.preset, input.width, input.height, input.fps);
  const audio = input.includeAudio ? EXPORT_AUDIO_BITRATE : 0;
  const bytes = ((video + audio) * input.duration) / 8;
  return Number.isFinite(bytes) ? Math.ceil(bytes) : null;
}
