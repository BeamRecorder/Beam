import { clipEndMs, isVisualClip, type Clip } from '../shared/composition-types';
import { EMPTY_CLIP_TRANSITIONS, normalizeClipTransitions } from '../shared/clip-transitions';

/** Shared timing rules for a transient trim and its eventual validated command. */
export function trimClipTiming(clip: Clip, edge: 'start' | 'end', target: number): Clip {
  const rate = Math.max(0.01, clip.playbackRate);
  const timelineDurationMs = edge === 'start' ? clipEndMs(clip) - target : target - clip.timelineStartMs;
  return {
    ...clip,
    timelineStartMs: edge === 'start' ? target : clip.timelineStartMs,
    timelineDurationMs,
    sourceInMs:
      edge === 'end'
        ? clip.sourceInMs
        : clip.kind === 'caption'
          ? 0
          : isVisualClip(clip) && clip.freezeFrameSourceMs !== undefined
            ? clip.freezeFrameSourceMs
            : Math.max(0, clip.sourceInMs + Math.round((target - clip.timelineStartMs) * rate)),
    sourceDurationMs: Math.round(timelineDurationMs * rate),
    transitions: normalizeClipTransitions(clip.transitions ?? EMPTY_CLIP_TRANSITIONS, timelineDurationMs, clip.kind),
  };
}
