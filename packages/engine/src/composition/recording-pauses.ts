import type { ClipComposition } from '../shared/composition-types';
import type { ZoomElement } from '../zoom/zoom-types';
import type { RecordingPauseCleanup } from './recording-pause-types';
import { removeTimelineGap, timelineGaps } from './timeline-gaps';

/** Close internal gaps between captured screen segments without changing source clocks. */
export function removeRecordingPauseGaps(
  composition: ClipComposition,
  sessionId: string,
  zoomElements: readonly ZoomElement[] = [],
): RecordingPauseCleanup {
  const assets = new Set(
    composition.assets
      .filter((asset) => asset.origin === 'session' && asset.sessionId === sessionId)
      .map((asset) => asset.id),
  );
  const screen = composition.clips.filter((clip) => clip.kind === 'screen' && assets.has(clip.assetId));
  const lanes = new Set(screen.map((clip) => clip.trackId));
  // Work from right to left so earlier gap bounds and clip identities stay valid.
  const gaps = [...lanes]
    .flatMap((trackId) => timelineGaps(screen.filter((clip) => clip.trackId === trackId)))
    .filter((gap) => gap.startMs > 0)
    .sort((a, b) => b.startMs - a.startMs);
  let result: RecordingPauseCleanup = {
    composition,
    zoomElements: [...zoomElements],
    removedCount: 0,
    removedDurationMs: 0,
  };
  for (const gap of gaps) {
    const next = removeTimelineGap(result.composition, gap, result.zoomElements);
    if (!next.rippleRange) continue;
    result = {
      composition: next.composition,
      zoomElements: next.zoomElements,
      removedCount: result.removedCount + 1,
      removedDurationMs: result.removedDurationMs + next.rippleRange.endMs - next.rippleRange.startMs,
    };
  }
  return result;
}
