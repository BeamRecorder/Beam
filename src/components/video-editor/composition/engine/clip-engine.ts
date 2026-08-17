import {
  COMPOSITION_SCHEMA_VERSION,
  clipEndMs,
  emptyComposition,
  isAudioClip,
  isBlurClip,
  isVisualClip,
  type Clip,
  type ClipAppearance,
  type ClipComposition,
  type BlurClip,
  type MediaAsset,
  type NormalizedCrop,
  type NormalizedTransform,
  type ClipTransition,
} from '~/media/shared/composition-types';
import { normalizeClipTransitions } from '~/media/shared/clip-transitions';
import type { CameraFramingPreset } from '~/media/shared/camera-layout-types';
import { EMPTY_CLIP_TRANSITIONS } from '~/media/shared/clip-transitions';
import {
  maximumVisualTrackDuration,
  normalizeClipOrders,
  reorderClipOrders,
  visualMoveDeltaBounds,
  visualTrimBounds,
} from './visual-track-layout';
import {
  CompositionEngineError,
  MAX_PLAYBACK_RATE,
  MIN_CLIP_DURATION_MS,
  MIN_PLAYBACK_RATE,
  validateComposition,
} from './clip-composition-validation';
export { setCameraLayout, setCameraSplitPadding, setCameraSplitRatio } from './camera-layout-operations';
export {
  CompositionEngineError,
  MAX_PLAYBACK_RATE,
  MIN_CLIP_DURATION_MS,
  MIN_PLAYBACK_RATE,
  validateComposition,
} from './clip-composition-validation';

const finite = (value: number) => Number.isFinite(value);
const integer = (value: number) => Math.round(value);
// JSON cloning deliberately unwraps Vue proxies while preserving serializable composition state.
const cloneValue = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;
const clone = (composition: ClipComposition): ClipComposition => cloneValue(composition);
const createId = (): string => crypto.randomUUID();

const byId = (composition: ClipComposition, clipId: string) => {
  const clip = composition.clips.find((entry) => entry.id === clipId);
  if (!clip) throw new CompositionEngineError(`Unknown clip: ${clipId}`);
  return clip;
};

const targetIds = (composition: ClipComposition, clipId: string) => {
  const clip = byId(composition, clipId);
  if (!clip.groupId) return [clip.id];
  return composition.clips.filter((entry) => entry.groupId === clip.groupId).map((entry) => entry.id);
};

const normalizeGroups = (clips: Clip[]) => {
  const counts = new Map<string, number>();
  for (const clip of clips) if (clip.groupId) counts.set(clip.groupId, (counts.get(clip.groupId) ?? 0) + 1);
  return clips.map((clip) => (clip.groupId && counts.get(clip.groupId) === 1 ? { ...clip, groupId: undefined } : clip));
};

export const createComposition = (
  assets: MediaAsset[] = [],
  clips: Clip[] = [],
  keyboardCaptionSessions: string[] = [],
): ClipComposition => {
  const composition: ClipComposition = {
    schemaVersion: COMPOSITION_SCHEMA_VERSION,
    assets: cloneValue(assets),
    clips: normalizeClipOrders(
      normalizeGroups(
        cloneValue(clips).map((clip) => ({
          ...clip,
          transitions: clip.transitions ?? { entry: null, exit: null },
          ...(clip.kind === 'webcam'
            ? {
                cameraLayoutPreset: clip.cameraLayoutPreset ?? 'custom',
                cameraFramingPreset: clip.cameraFramingPreset ?? 'custom',
                cameraSplitRatio: clip.cameraSplitRatio ?? 0.5,
                cameraSplitPadding: clip.cameraSplitPadding ?? 0,
              }
            : {}),
        })),
      ),
    ),
    keyboardCaptionSessions: [...new Set(keyboardCaptionSessions)],
  };
  validateComposition(composition);
  return composition;
};

export function addAsset(composition: ClipComposition, asset: MediaAsset): ClipComposition {
  const next = clone(composition);
  const index = next.assets.findIndex((entry) => entry.id === asset.id);
  if (index < 0) next.assets.push(cloneValue(asset));
  else next.assets[index] = cloneValue(asset);
  validateComposition({
    ...next,
    clips: next.clips.filter(
      (clip) => clip.kind === 'caption' || isBlurClip(clip) || next.assets.some((entry) => entry.id === clip.assetId),
    ),
  });
  return next;
}

export function addClip(composition: ClipComposition, clip: Clip, asset?: MediaAsset): ClipComposition {
  const next = asset ? addAsset(composition, asset) : clone(composition);
  if (next.clips.some((entry) => entry.id === clip.id)) throw new CompositionEngineError(`Duplicate clip: ${clip.id}`);
  next.clips = normalizeClipOrders([...next.clips, cloneValue(clip)]);
  validateComposition(next);
  return next;
}

export function updateClip(
  composition: ClipComposition,
  clipId: string,
  update: (clip: Clip) => Clip,
): ClipComposition {
  const next = clone(composition);
  next.clips = next.clips.map((clip) => (clip.id === clipId ? update(clip) : clip));
  byId(next, clipId);
  next.clips = normalizeClipOrders(normalizeGroups(next.clips));
  validateComposition(next);
  return next;
}

export function moveClip(composition: ClipComposition, clipId: string, timelineStartMs: number): ClipComposition {
  if (!finite(timelineStartMs)) throw new CompositionEngineError('Invalid timeline position.');
  const next = clone(composition);
  const source = byId(next, clipId);
  const delta = integer(timelineStartMs) - source.timelineStartMs;
  const ids = new Set(targetIds(next, clipId));
  const { min, max } = visualMoveDeltaBounds(next.clips, ids);
  const minimum = Math.min(...next.clips.filter((clip) => ids.has(clip.id)).map((clip) => clip.timelineStartMs));
  const adjustedDelta = Math.max(-minimum, delta);
  if (adjustedDelta < min || adjustedDelta > max) {
    throw new CompositionEngineError('Clip move would overlap another fragment on the same visual track.');
  }
  next.clips = next.clips.map((clip) =>
    ids.has(clip.id) ? { ...clip, timelineStartMs: clip.timelineStartMs + adjustedDelta } : clip,
  );
  validateComposition(next);
  return next;
}

export function setPlaybackRate(composition: ClipComposition, clipId: string, playbackRate: number): ClipComposition {
  if (!finite(playbackRate) || playbackRate < MIN_PLAYBACK_RATE || playbackRate > MAX_PLAYBACK_RATE) {
    throw new CompositionEngineError(`Playback rate must be between ${MIN_PLAYBACK_RATE}x and ${MAX_PLAYBACK_RATE}x.`);
  }
  const next = clone(composition);
  const ids = new Set(targetIds(next, clipId));
  const source = byId(next, clipId);
  const desiredDuration = Math.max(MIN_CLIP_DURATION_MS, integer(source.sourceDurationMs / playbackRate));
  const maximumDuration = maximumVisualTrackDuration(next.clips, ids);
  const effectiveRate =
    desiredDuration > maximumDuration
      ? Math.max(playbackRate, source.sourceDurationMs / maximumDuration)
      : playbackRate;
  next.clips = next.clips.map((clip) =>
    ids.has(clip.id)
      ? {
          ...clip,
          playbackRate: effectiveRate,
          timelineDurationMs: Math.max(MIN_CLIP_DURATION_MS, integer(clip.sourceDurationMs / effectiveRate)),
          transitions: normalizeClipTransitions(
            clip.transitions ?? EMPTY_CLIP_TRANSITIONS,
            Math.max(MIN_CLIP_DURATION_MS, integer(clip.sourceDurationMs / effectiveRate)),
            clip.kind,
          ),
        }
      : clip,
  );
  validateComposition(next);
  return next;
}

export function trimClip(
  composition: ClipComposition,
  clipId: string,
  edge: 'start' | 'end',
  timelineTimeMs: number,
): ClipComposition {
  const next = clone(composition);
  const source = byId(next, clipId);
  const target = integer(timelineTimeMs);
  if (!finite(target)) throw new CompositionEngineError('Invalid trim target time.');
  const originalEnd = clipEndMs(source);

  if (edge === 'start') {
    if (target < 0 || target > originalEnd - MIN_CLIP_DURATION_MS) {
      throw new CompositionEngineError('Invalid start trim boundary.');
    }
  } else {
    if (target < source.timelineStartMs + MIN_CLIP_DURATION_MS) {
      throw new CompositionEngineError('Invalid end trim boundary.');
    }
  }

  const ids = new Set(targetIds(next, clipId));
  const trackBounds = visualTrimBounds(next.clips, ids, edge);
  if ((edge === 'start' && target < trackBounds.min) || (edge === 'end' && target > trackBounds.max)) {
    throw new CompositionEngineError('Trim would overlap another fragment on the same visual track.');
  }
  next.clips = next.clips.map((clip) => {
    if (!ids.has(clip.id)) return clip;
    const rate = Math.max(0.01, clip.playbackRate);
    if (edge === 'start') {
      const startDelta = target - clip.timelineStartMs;
      const newTimelineDuration = clip.timelineStartMs + clip.timelineDurationMs - target;
      const newSourceDuration = integer(newTimelineDuration * rate);
      if (clip.kind === 'caption') {
        return {
          ...clip,
          timelineStartMs: target,
          timelineDurationMs: newTimelineDuration,
          sourceInMs: 0,
          sourceDurationMs: newSourceDuration,
          transitions: normalizeClipTransitions(
            clip.transitions ?? EMPTY_CLIP_TRANSITIONS,
            newTimelineDuration,
            clip.kind,
          ),
        };
      }
      const sourceDelta = integer(startDelta * rate);
      const newSourceInMs = Math.max(0, clip.sourceInMs + sourceDelta);
      return {
        ...clip,
        timelineStartMs: target,
        timelineDurationMs: newTimelineDuration,
        sourceInMs: newSourceInMs,
        sourceDurationMs: newSourceDuration,
        transitions: normalizeClipTransitions(
          clip.transitions ?? EMPTY_CLIP_TRANSITIONS,
          newTimelineDuration,
          clip.kind,
        ),
      };
    }
    const newTimelineDuration = target - clip.timelineStartMs;
    const newSourceDuration = integer(newTimelineDuration * rate);
    return {
      ...clip,
      timelineDurationMs: newTimelineDuration,
      sourceDurationMs: newSourceDuration,
      transitions: normalizeClipTransitions(clip.transitions ?? EMPTY_CLIP_TRANSITIONS, newTimelineDuration, clip.kind),
    };
  });
  validateComposition(next);
  return next;
}

export function splitClip(
  composition: ClipComposition,
  clipId: string,
  timelineTimeMs: number,
  idFactory: () => string = createId,
): ClipComposition {
  const next = clone(composition);
  const source = byId(next, clipId);
  const target = integer(timelineTimeMs);
  if (!finite(target) || target <= source.timelineStartMs || target >= clipEndMs(source))
    throw new CompositionEngineError('Split must be inside the clip.');
  const offset = target - source.timelineStartMs;
  const ids = new Set(targetIds(next, clipId));
  const rightGroupId = source.groupId ? idFactory() : undefined;
  const additions: Clip[] = [];
  next.clips = next.clips.map((clip) => {
    if (!ids.has(clip.id)) return clip;
    const leftSourceDuration = integer(offset * clip.playbackRate);
    const right: Clip = {
      ...clip,
      id: idFactory(),
      groupId: rightGroupId,
      timelineStartMs: target,
      timelineDurationMs: clip.timelineDurationMs - offset,
      sourceInMs: clip.sourceInMs + leftSourceDuration,
      sourceDurationMs: clip.sourceDurationMs - leftSourceDuration,
      transitions: normalizeClipTransitions(
        { entry: null, exit: clip.transitions?.exit ?? null },
        clip.timelineDurationMs - offset,
        clip.kind,
      ),
    };
    additions.push(right);
    return {
      ...clip,
      timelineDurationMs: offset,
      sourceDurationMs: leftSourceDuration,
      transitions: normalizeClipTransitions({ entry: clip.transitions?.entry ?? null, exit: null }, offset, clip.kind),
    };
  });
  next.clips = normalizeClipOrders([...next.clips, ...additions]);
  validateComposition(next);
  return next;
}

export function setClipEnabled(
  composition: ClipComposition,
  clipId: string,
  enabled: boolean,
  grouped = false,
): ClipComposition {
  const next = clone(composition);
  const ids = new Set(grouped ? targetIds(next, clipId) : [clipId]);
  next.clips = next.clips.map((clip) => (ids.has(clip.id) ? { ...clip, enabled: Boolean(enabled) } : clip));
  byId(next, clipId);
  return next;
}

export function deleteClip(composition: ClipComposition, clipId: string, grouped = false): ClipComposition {
  const next = clone(composition);
  const ids = new Set(grouped ? targetIds(next, clipId) : [clipId]);
  byId(next, clipId);
  next.clips = normalizeClipOrders(normalizeGroups(next.clips.filter((clip) => !ids.has(clip.id))));
  const usedAssets = new Set(
    next.clips.flatMap((clip) => (clip.kind === 'caption' || isBlurClip(clip) ? [] : [clip.assetId])),
  );
  next.assets = next.assets.filter((asset) => usedAssets.has(asset.id));
  validateComposition(next);
  return next;
}

export function setTransform(
  composition: ClipComposition,
  clipId: string,
  transform: NormalizedTransform,
): ClipComposition {
  if (
    ![transform.x, transform.y, transform.width, transform.height].every(finite) ||
    transform.width <= 0 ||
    transform.height <= 0
  ) {
    throw new CompositionEngineError('Invalid clip transform.');
  }
  return updateClip(composition, clipId, (clip) => {
    if (clip.kind === 'audio') throw new CompositionEngineError('Audio clips do not have a transform.');
    if (
      'transform' in clip &&
      clip.transform &&
      clip.transform.x === transform.x &&
      clip.transform.y === transform.y &&
      clip.transform.width === transform.width &&
      clip.transform.height === transform.height
    )
      return clip;
    return {
      ...clip,
      transform: { ...transform },
      ...(clip.kind === 'webcam' ? { cameraLayoutPreset: 'custom' as const } : {}),
    };
  });
}

export function setBlurEffect(
  composition: ClipComposition,
  clipId: string,
  patch: Partial<Pick<BlurClip, 'shape' | 'mode' | 'strength' | 'feather' | 'cornerRadius' | 'tintOpacity' | 'color'>>,
): ClipComposition {
  return updateClip(composition, clipId, (clip) => {
    if (!isBlurClip(clip)) throw new CompositionEngineError('Only blur clips have blur settings.');
    return { ...clip, ...patch };
  });
}

export function setCrop(
  composition: ClipComposition,
  clipId: string,
  crop: NormalizedCrop | undefined,
): ClipComposition {
  if (crop && (![crop.x, crop.y, crop.width, crop.height].every(finite) || crop.width <= 0 || crop.height <= 0))
    throw new CompositionEngineError('Invalid clip crop.');
  return updateClip(composition, clipId, (clip) => {
    if (!isVisualClip(clip)) throw new CompositionEngineError('Only visual clips can be cropped.');
    return {
      ...clip,
      crop: crop ? { ...crop } : undefined,
      ...(clip.kind === 'webcam' ? { cameraFramingPreset: 'custom' as const } : {}),
    };
  });
}

export function setCameraFraming(
  composition: ClipComposition,
  clipId: string,
  preset: Exclude<CameraFramingPreset, 'custom'>,
): ClipComposition {
  return updateClip(composition, clipId, (clip) => {
    if (clip.kind !== 'webcam') throw new CompositionEngineError('Only camera clips have camera framing.');
    return { ...clip, cameraFramingPreset: preset, crop: undefined };
  });
}

export const setAppearance = (composition: ClipComposition, clipId: string, appearance: ClipAppearance) =>
  updateClip(composition, clipId, (clip) => {
    if (!isVisualClip(clip)) throw new CompositionEngineError('Only visual clips have an appearance.');
    return { ...clip, appearance: cloneValue(appearance) };
  });

export const setMirrored = (composition: ClipComposition, clipId: string, isMirrored: boolean) =>
  updateClip(composition, clipId, (clip) => {
    if (!isVisualClip(clip)) throw new CompositionEngineError('Only visual clips can be mirrored.');
    return { ...clip, isMirrored };
  });

export const setMirroredY = (composition: ClipComposition, clipId: string, isMirroredY: boolean) =>
  updateClip(composition, clipId, (clip) => {
    if (!isVisualClip(clip)) throw new CompositionEngineError('Only visual clips can be mirrored.');
    return { ...clip, isMirroredY };
  });

export const setVolume = (composition: ClipComposition, clipId: string, volume: number) =>
  updateClip(composition, clipId, (clip) => {
    if (!isAudioClip(clip)) throw new CompositionEngineError('Only audio clips have a volume.');
    return { ...clip, volume: Math.max(0, Math.min(200, volume)) };
  });

export function setClipTransition(
  composition: ClipComposition,
  clipId: string,
  edge: 'entry' | 'exit',
  transition: ClipTransition | null,
): ClipComposition {
  return updateClip(composition, clipId, (clip) => ({
    ...clip,
    transitions: normalizeClipTransitions(
      { ...(clip.transitions ?? EMPTY_CLIP_TRANSITIONS), [edge]: transition },
      clip.timelineDurationMs,
      clip.kind,
    ),
  }));
}

export function reorderClip(composition: ClipComposition, clipId: string, targetIndex: number): ClipComposition {
  const next = clone(composition);
  const reordered = reorderClipOrders(next.clips, clipId, targetIndex);
  if (!reordered) throw new CompositionEngineError('Invalid clip reorder.');
  next.clips = reordered;
  validateComposition(next);
  return next;
}

export function detachClip(composition: ClipComposition, clipId: string): ClipComposition {
  return updateClip(composition, clipId, (clip) => ({ ...clip, groupId: undefined }));
}

export function linkClips(composition: ClipComposition, clipIds: string[], groupId = createId()): ClipComposition {
  const next = clone(composition);
  const unique = [...new Set(clipIds)];
  if (unique.length < 2) throw new CompositionEngineError('At least two clips are required for a group.');
  const clips = unique.map((id) => byId(next, id));
  const anchor = clips[0];
  if (
    clips.some(
      (clip) =>
        clip.timelineStartMs !== anchor.timelineStartMs ||
        clip.timelineDurationMs !== anchor.timelineDurationMs ||
        clip.playbackRate !== anchor.playbackRate,
    )
  ) {
    throw new CompositionEngineError('Grouped clips must share timeline timing.');
  }
  next.clips = next.clips.map((clip) => (unique.includes(clip.id) ? { ...clip, groupId } : clip));
  validateComposition(next);
  return next;
}

export const resetComposition = () => emptyComposition();
