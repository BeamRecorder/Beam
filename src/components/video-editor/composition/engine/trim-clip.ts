import {
  clipEndMs,
  isColorClip,
  isShapeClip,
  isVisualClip,
  type Clip,
  type ClipComposition,
  type VisualClip,
} from '~/media/shared/composition-types';
import { EMPTY_CLIP_TRANSITIONS, normalizeClipTransitions } from '~/media/shared/clip-transitions';
import { CompositionEngineError, MIN_CLIP_DURATION_MS, validateComposition } from './clip-composition-validation';
import { visualTrimBounds } from './visual-track-layout';
import { downstreamVisualTrackRippleIds } from './visual-track-ripple';

const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;
const integer = (value: number) => Math.round(value);
const isFreeze = (clip: Clip): clip is VisualClip & { freezeFrameSourceMs: number } =>
  isVisualClip(clip) && clip.freezeFrameSourceMs !== undefined;

const targetIds = (composition: ClipComposition, clip: Clip) =>
  new Set(
    clip.groupId
      ? composition.clips.filter((entry) => entry.groupId === clip.groupId).map((entry) => entry.id)
      : [clip.id],
  );

const assetDurationFor = (composition: ClipComposition, clip: Clip) =>
  clip.kind === 'caption' || isColorClip(clip) || isShapeClip(clip) || clip.kind === 'blur'
    ? null
    : (composition.assets.find((asset) => asset.id === clip.assetId)?.durationMs ?? null);

const hasUnlimitedDuration = (clip: Clip) =>
  clip.kind === 'caption' ||
  isColorClip(clip) ||
  isShapeClip(clip) ||
  clip.kind === 'blur' ||
  (isVisualClip(clip) && (clip.kind === 'image' || clip.freezeFrameSourceMs !== undefined));

export function clipTrimBounds(
  composition: ClipComposition,
  clipId: string,
  edge: 'start' | 'end',
): { minMs: number; maxMs: number } {
  const source = composition.clips.find((clip) => clip.id === clipId);
  if (!source) throw new CompositionEngineError(`Unknown clip: ${clipId}`);
  const ids = targetIds(composition, source);
  const targets = composition.clips.filter((clip) => ids.has(clip.id));
  const trackBounds = visualTrimBounds(composition.clips, ids, edge);
  if (edge === 'start') {
    const sourceMin = Math.max(
      0,
      ...targets.map((clip) =>
        hasUnlimitedDuration(clip) ? 0 : clip.timelineStartMs - clip.sourceInMs / Math.max(0.01, clip.playbackRate),
      ),
    );
    return {
      minMs: Math.ceil(Math.max(sourceMin, trackBounds.min)),
      maxMs: clipEndMs(source) - MIN_CLIP_DURATION_MS,
    };
  }
  const sourceMax = Math.min(
    Infinity,
    ...targets.map((clip) => {
      if (hasUnlimitedDuration(clip)) return Infinity;
      const assetDurationMs = assetDurationFor(composition, clip);
      if (assetDurationMs === null) return Infinity;
      const remainingSourceMs = Math.max(0, assetDurationMs - (clip.sourceInMs + clip.sourceDurationMs));
      return clipEndMs(clip) + remainingSourceMs / Math.max(0.01, clip.playbackRate);
    }),
  );
  return {
    minMs: source.timelineStartMs + MIN_CLIP_DURATION_MS,
    maxMs: Math.floor(isVisualClip(source) ? sourceMax : Math.min(sourceMax, trackBounds.max)),
  };
}

export function trimClip(
  composition: ClipComposition,
  clipId: string,
  edge: 'start' | 'end',
  timelineTimeMs: number,
): ClipComposition {
  const next = clone(composition);
  const source = next.clips.find((clip) => clip.id === clipId);
  if (!source) throw new CompositionEngineError(`Unknown clip: ${clipId}`);
  const target = integer(timelineTimeMs);
  if (!Number.isFinite(target)) throw new CompositionEngineError('Invalid trim target time.');
  const originalEnd = clipEndMs(source);
  const bounds = clipTrimBounds(next, clipId, edge);
  if (target < bounds.minMs || target > bounds.maxMs) {
    throw new CompositionEngineError(`Invalid ${edge} trim boundary.`);
  }

  const ids = targetIds(next, source);
  const trackBounds = visualTrimBounds(next.clips, ids, edge);
  const freezeRipple = edge === 'end' && [...ids].some((id) => isFreeze(next.clips.find((clip) => clip.id === id)!));
  const collisionRipple = edge === 'end' && target > trackBounds.max && isVisualClip(source);
  if (edge === 'end' && target > trackBounds.max && !collisionRipple) {
    throw new CompositionEngineError('Trim would overlap another fragment on the same visual track.');
  }
  const rippleDelta = freezeRipple || collisionRipple ? target - originalEnd : 0;
  const rippleIds = downstreamVisualTrackRippleIds(next.clips, ids, originalEnd);

  next.clips = next.clips.map((clip) => {
    if (!ids.has(clip.id)) {
      return rippleDelta !== 0 && rippleIds.has(clip.id)
        ? { ...clip, timelineStartMs: clip.timelineStartMs + rippleDelta }
        : clip;
    }
    const rate = Math.max(0.01, clip.playbackRate);
    if (edge === 'start') {
      const newTimelineDuration = clipEndMs(clip) - target;
      const sourceDelta = integer((target - clip.timelineStartMs) * rate);
      return {
        ...clip,
        timelineStartMs: target,
        timelineDurationMs: newTimelineDuration,
        sourceInMs:
          clip.kind === 'caption'
            ? 0
            : isFreeze(clip)
              ? clip.freezeFrameSourceMs!
              : Math.max(0, clip.sourceInMs + sourceDelta),
        sourceDurationMs: integer(newTimelineDuration * rate),
        transitions: normalizeClipTransitions(
          clip.transitions ?? EMPTY_CLIP_TRANSITIONS,
          newTimelineDuration,
          clip.kind,
        ),
      };
    }
    const newTimelineDuration = target - clip.timelineStartMs;
    return {
      ...clip,
      timelineDurationMs: newTimelineDuration,
      sourceDurationMs: integer(newTimelineDuration * rate),
      transitions: normalizeClipTransitions(clip.transitions ?? EMPTY_CLIP_TRANSITIONS, newTimelineDuration, clip.kind),
    };
  });
  validateComposition(next);
  return next;
}
