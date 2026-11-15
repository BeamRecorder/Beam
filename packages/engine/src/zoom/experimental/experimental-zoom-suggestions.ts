import { buildInteractionZoomSuggestions } from '../recordly/timeline/zoomSuggestionUtils';
import type { ExperimentalGenerationInputs } from './experimental-zoom-types';
import { recordlyTelemetry } from './recordly-inputs';

/** Adapt the existing Beam call shape; generation executes the pinned upstream implementation. */
export function experimentalZoomSuggestions(input: ExperimentalGenerationInputs) {
  return buildInteractionZoomSuggestions({
    cursorTelemetry: recordlyTelemetry(input.telemetry),
    totalMs: input.durationMs,
    clipRegions: input.clips?.map((clip, index) => ({ ...clip, id: String(index) })),
    defaultDurationMs: input.duration ?? 2000,
    reservedSpans: input.reserved ? [...input.reserved] : undefined,
    spacingMs: input.spacingMs,
    mergeGapMs: input.mergeGapMs,
    padMs: input.paddingMs,
  }).suggestions;
}
