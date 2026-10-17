import type { TimelineSelectionMoveResult } from '@beam/engine/composition/timeline-edit-types';
import { timingPreviewFor } from '@beam/engine/composition/timing-preview';

export const timelineMovePreviews = (
  preview: TimelineSelectionMoveResult,
  clipIds: ReadonlySet<string>,
  zoomIds: ReadonlySet<string>,
) => ({
  clips: Object.fromEntries(
    [...(timingPreviewFor(preview.composition)?.patches.values() ?? preview.composition.clips)]
      .filter((clip) => clipIds.has(clip.id))
      .map((clip) => [clip.id, { startMs: clip.timelineStartMs, durationMs: clip.timelineDurationMs }]),
  ),
  zooms: Object.fromEntries(
    preview.zoomElements
      .filter((zoom) => zoomIds.has(zoom.id))
      .map((zoom) => [zoom.id, { startMs: zoom.startMs, endMs: zoom.endMs }]),
  ),
});
