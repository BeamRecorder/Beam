import type { ClipComposition } from '../shared/composition-types';
import { compositionDurationMs } from '../shared/timeline-mapping';
import type { ZoomElement } from '../zoom/zoom-types';

/** A playback view; authored clips and project history keep their original timing. */
export function compositionWithZoomDuration(
  composition: ClipComposition,
  zooms: readonly ZoomElement[],
): ClipComposition {
  const clipEnd = compositionDurationMs(composition);
  const durationMs = zooms.reduce((end, zoom) => Math.max(end, zoom.endMs), clipEnd);
  return durationMs > clipEnd ? { ...composition, durationMs } : composition;
}
