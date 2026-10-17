import { clipEndMs, isVisualClip, type ClipComposition } from '../shared/composition-types';
import { CompositionEngineError } from '../commands/clip-composition-validation';
import { clipTrimBounds } from '../commands/trim-clip';
import { trimClipTiming } from '../commands/trim-clip-timing';
import { visualTrimBounds } from '../commands/visual-track-layout';
import { downstreamVisualTrackRippleIds } from '../commands/visual-track-ripple';
import { prepareTimingPreview } from './timing-preview';
import type { ClipTrimPreviewFactory } from './clip-trim-preview-types';

/** A gesture borrows one base document; pointer updates touch only trimmed/rippled records. */
export function prepareClipTrimPreview(
  composition: ClipComposition,
  clipId: string,
  edge: 'start' | 'end',
): ClipTrimPreviewFactory {
  const source = composition.clips.find((clip) => clip.id === clipId);
  if (!source) throw new CompositionEngineError(`Unknown clip: ${clipId}`);
  const targets = composition.clips.filter((clip) =>
    source.groupId ? clip.groupId === source.groupId : clip.id === clipId,
  );
  const ids = new Set(targets.map((clip) => clip.id));
  const bounds = clipTrimBounds(composition, clipId, edge);
  const trackBounds = visualTrimBounds(composition.clips, ids, edge);
  const originalEnd = clipEndMs(source);
  const freezeRipple = targets.some((clip) => isVisualClip(clip) && clip.freezeFrameSourceMs !== undefined);
  const rippleIds =
    edge === 'end' ? downstreamVisualTrackRippleIds(composition.clips, ids, originalEnd) : new Set<string>();
  const rippleClips = composition.clips.filter((clip) => rippleIds.has(clip.id));
  const movingIds = new Set([...ids, ...rippleIds]);
  const preview = prepareTimingPreview(composition, movingIds);
  let stationaryEnd = composition.durationMs ?? 0;
  for (const clip of composition.clips)
    if (!movingIds.has(clip.id)) stationaryEnd = Math.max(stationaryEnd, clipEndMs(clip));

  return (timeMs) => {
    const target = Math.round(timeMs);
    if (!Number.isFinite(target) || target < bounds.minMs || target > bounds.maxMs)
      throw new CompositionEngineError('Invalid trim preview boundary.');
    const ripple = edge === 'end' && (freezeRipple || (isVisualClip(source) && target > trackBounds.max));
    const delta = ripple ? target - originalEnd : 0;
    const clips = [
      ...targets.map((clip) => trimClipTiming(clip, edge, target)),
      ...rippleClips.map((clip) => (delta ? { ...clip, timelineStartMs: clip.timelineStartMs + delta } : clip)),
    ];
    let durationMs = stationaryEnd;
    for (const clip of clips) durationMs = Math.max(durationMs, clipEndMs(clip));
    return { composition: preview(clips), clips, durationMs };
  };
}
