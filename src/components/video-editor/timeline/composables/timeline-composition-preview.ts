import { clipEndMs, isVisualClip, type Clip, type ClipComposition } from '~/media/shared/composition-types';
import { visualTrimBounds } from '../../composition/engine/visual-track-layout';
import { downstreamVisualTrackRippleIds } from '../../composition/engine/visual-track-ripple';

const linkedIds = (composition: ClipComposition, clip: Clip) =>
  new Set(
    clip.groupId
      ? composition.clips.filter((entry) => entry.groupId === clip.groupId).map((entry) => entry.id)
      : [clip.id],
  );

export function previewClipMove(composition: ClipComposition, clip: Clip, timelineStartMs: number): ClipComposition {
  const ids = linkedIds(composition, clip);
  const deltaMs = timelineStartMs - clip.timelineStartMs;
  return {
    ...composition,
    clips: composition.clips.map((entry) =>
      ids.has(entry.id) ? { ...entry, timelineStartMs: entry.timelineStartMs + deltaMs } : entry,
    ),
  };
}

export function previewClipTrim(
  composition: ClipComposition,
  clip: Clip,
  edge: 'start' | 'end',
  timelineTimeMs: number,
): ClipComposition {
  const ids = linkedIds(composition, clip);
  const originalEndMs = clipEndMs(clip);
  const trackBounds = visualTrimBounds(composition.clips, ids, edge);
  const freezeRipple =
    edge === 'end' &&
    composition.clips.some(
      (entry) => ids.has(entry.id) && isVisualClip(entry) && entry.freezeFrameSourceMs !== undefined,
    );
  const collisionRipple = edge === 'end' && isVisualClip(clip) && timelineTimeMs > trackBounds.max;
  const rippleDeltaMs = freezeRipple || collisionRipple ? timelineTimeMs - originalEndMs : 0;
  const rippleIds = downstreamVisualTrackRippleIds(composition.clips, ids, originalEndMs);
  return {
    ...composition,
    clips: composition.clips.map((entry) => {
      if (!ids.has(entry.id)) {
        return rippleDeltaMs !== 0 && rippleIds.has(entry.id)
          ? { ...entry, timelineStartMs: entry.timelineStartMs + rippleDeltaMs }
          : entry;
      }
      if (edge === 'end') {
        const timelineDurationMs = timelineTimeMs - entry.timelineStartMs;
        return {
          ...entry,
          timelineDurationMs,
          sourceDurationMs: Math.round(timelineDurationMs * Math.max(0.01, entry.playbackRate)),
        };
      }
      const startDeltaMs = timelineTimeMs - entry.timelineStartMs;
      const timelineDurationMs = entry.timelineStartMs + entry.timelineDurationMs - timelineTimeMs;
      const sourceDurationMs = Math.round(timelineDurationMs * Math.max(0.01, entry.playbackRate));
      return {
        ...entry,
        timelineStartMs: timelineTimeMs,
        timelineDurationMs,
        sourceInMs:
          entry.kind === 'caption'
            ? 0
            : 'freezeFrameSourceMs' in entry && entry.freezeFrameSourceMs !== undefined
              ? entry.freezeFrameSourceMs
              : Math.max(0, entry.sourceInMs + Math.round(startDeltaMs * Math.max(0.01, entry.playbackRate))),
        sourceDurationMs,
      };
    }),
  };
}
