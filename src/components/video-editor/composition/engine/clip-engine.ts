import {
  COMPOSITION_SCHEMA_VERSION,
  clipEndMs,
  emptyComposition,
  isAudioClip,
  isVisualClip,
  type Clip,
  type ClipAppearance,
  type ClipComposition,
  type MediaAsset,
  type NormalizedCrop,
  type NormalizedTransform,
} from '~/media/shared/composition-types';

export const MIN_PLAYBACK_RATE = 0.25;
export const MAX_PLAYBACK_RATE = 4;
export const MIN_CLIP_DURATION_MS = 40;

export class CompositionEngineError extends Error {}

const finite = (value: number) => Number.isFinite(value);
const integer = (value: number) => Math.round(value);
// Composition state is deliberately JSON-serializable. JSON cloning unwraps Vue
// proxies before copying, unlike structuredClone which throws on reactive state.
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

const normalizeOrders = (clips: Clip[]) =>
  [...clips]
    .sort(
      (left, right) =>
        left.order - right.order || left.timelineStartMs - right.timelineStartMs || left.id.localeCompare(right.id),
    )
    .map((clip, order) => ({ ...clip, order }));

export const createComposition = (
  assets: MediaAsset[] = [],
  clips: Clip[] = [],
  keyboardCaptionSessions: string[] = [],
): ClipComposition => {
  const composition: ClipComposition = {
    schemaVersion: COMPOSITION_SCHEMA_VERSION,
    assets: cloneValue(assets),
    clips: normalizeOrders(normalizeGroups(cloneValue(clips))),
    keyboardCaptionSessions: [...new Set(keyboardCaptionSessions)],
  };
  validateComposition(composition);
  return composition;
};

export function validateComposition(composition: ClipComposition): void {
  if (
    !composition ||
    composition.schemaVersion !== COMPOSITION_SCHEMA_VERSION ||
    !Array.isArray(composition.assets) ||
    !Array.isArray(composition.clips) ||
    !Array.isArray(composition.keyboardCaptionSessions) ||
    composition.keyboardCaptionSessions.some((sessionId) => typeof sessionId !== 'string' || !sessionId)
  ) {
    throw new CompositionEngineError('Invalid composition schema.');
  }
  const assetIds = new Set<string>();
  for (const asset of composition.assets) {
    if (
      !asset?.id ||
      assetIds.has(asset.id) ||
      !['video', 'image', 'audio'].includes(asset.kind) ||
      !finite(asset.durationMs) ||
      asset.durationMs < 0
    ) {
      throw new CompositionEngineError('Invalid media asset.');
    }
    assetIds.add(asset.id);
  }
  const clipIds = new Set<string>();
  const groupTiming = new Map<string, string>();
  for (const clip of composition.clips) {
    if (
      !clip?.id ||
      clipIds.has(clip.id) ||
      !['screen', 'video', 'image', 'webcam', 'audio', 'caption'].includes(clip.kind)
    ) {
      throw new CompositionEngineError('Invalid clip identity.');
    }
    clipIds.add(clip.id);
    if (
      ![
        clip.timelineStartMs,
        clip.timelineDurationMs,
        clip.sourceInMs,
        clip.sourceDurationMs,
        clip.playbackRate,
        clip.order,
      ].every(finite) ||
      clip.timelineStartMs < 0 ||
      clip.timelineDurationMs < MIN_CLIP_DURATION_MS ||
      clip.sourceInMs < 0 ||
      clip.sourceDurationMs <= 0 ||
      clip.playbackRate < MIN_PLAYBACK_RATE ||
      clip.playbackRate > MAX_PLAYBACK_RATE
    ) {
      throw new CompositionEngineError('Invalid clip timing.');
    }
    const expectedTimelineDuration = clip.sourceDurationMs / clip.playbackRate;
    if (Math.abs(expectedTimelineDuration - clip.timelineDurationMs) > 2) {
      throw new CompositionEngineError('Clip source and timeline durations disagree.');
    }
    if (clip.kind !== 'caption' && !assetIds.has(clip.assetId))
      throw new CompositionEngineError(`Missing asset for clip: ${clip.id}`);
    if (clip.kind === 'caption') {
      const caption = clip.caption;
      const textCaption = caption?.type === 'text' && Array.isArray(caption.sentences);
      const keyboardCaption =
        caption?.type === 'keyboard' &&
        Array.isArray(caption.steps) &&
        caption.steps.length > 0 &&
        typeof caption.followCursor === 'boolean' &&
        Boolean(caption.sourceSessionId);
      if (!textCaption && !keyboardCaption) throw new CompositionEngineError('Invalid caption clip.');
    }
    if (
      isVisualClip(clip) &&
      (![clip.transform.x, clip.transform.y, clip.transform.width, clip.transform.height].every(finite) ||
        clip.transform.width <= 0 ||
        clip.transform.height <= 0)
    ) {
      throw new CompositionEngineError('Invalid visual transform.');
    }
    if (isAudioClip(clip) && (!finite(clip.volume) || clip.volume < 0 || clip.volume > 200))
      throw new CompositionEngineError('Invalid clip volume.');
    if (clip.groupId) {
      const timing = `${clip.timelineStartMs}:${clip.timelineDurationMs}:${clip.playbackRate}`;
      const known = groupTiming.get(clip.groupId);
      if (known && known !== timing) throw new CompositionEngineError('Grouped clips must share timeline timing.');
      groupTiming.set(clip.groupId, timing);
    }
  }
}

export function addAsset(composition: ClipComposition, asset: MediaAsset): ClipComposition {
  const next = clone(composition);
  const index = next.assets.findIndex((entry) => entry.id === asset.id);
  if (index < 0) next.assets.push(cloneValue(asset));
  else next.assets[index] = cloneValue(asset);
  validateComposition({
    ...next,
    clips: next.clips.filter(
      (clip) => clip.kind === 'caption' || next.assets.some((entry) => entry.id === clip.assetId),
    ),
  });
  return next;
}

export function addClip(composition: ClipComposition, clip: Clip, asset?: MediaAsset): ClipComposition {
  const next = asset ? addAsset(composition, asset) : clone(composition);
  if (next.clips.some((entry) => entry.id === clip.id)) throw new CompositionEngineError(`Duplicate clip: ${clip.id}`);
  next.clips = normalizeOrders([...next.clips, cloneValue(clip)]);
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
  next.clips = normalizeOrders(normalizeGroups(next.clips));
  validateComposition(next);
  return next;
}

export function moveClip(composition: ClipComposition, clipId: string, timelineStartMs: number): ClipComposition {
  if (!finite(timelineStartMs)) throw new CompositionEngineError('Invalid timeline position.');
  const next = clone(composition);
  const source = byId(next, clipId);
  const delta = integer(timelineStartMs) - source.timelineStartMs;
  const ids = new Set(targetIds(next, clipId));
  const minimum = Math.min(
    ...next.clips.filter((clip) => ids.has(clip.id)).map((clip) => clip.timelineStartMs + delta),
  );
  const adjustedDelta = delta - Math.min(0, minimum);
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
  next.clips = next.clips.map((clip) =>
    ids.has(clip.id)
      ? {
          ...clip,
          playbackRate,
          timelineDurationMs: Math.max(MIN_CLIP_DURATION_MS, integer(clip.sourceDurationMs / playbackRate)),
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
  if (!finite(target) || target <= source.timelineStartMs || target >= clipEndMs(source))
    throw new CompositionEngineError('Trim must be inside the clip.');
  const startDelta = target - source.timelineStartMs;
  const endDuration = target - source.timelineStartMs;
  const ids = new Set(targetIds(next, clipId));
  next.clips = next.clips.map((clip) => {
    if (!ids.has(clip.id)) return clip;
    if (edge === 'start') {
      const sourceDelta = integer(startDelta * clip.playbackRate);
      return {
        ...clip,
        timelineStartMs: clip.timelineStartMs + startDelta,
        timelineDurationMs: clip.timelineDurationMs - startDelta,
        sourceInMs: clip.sourceInMs + sourceDelta,
        sourceDurationMs: clip.sourceDurationMs - sourceDelta,
      };
    }
    return {
      ...clip,
      timelineDurationMs: endDuration,
      sourceDurationMs: integer(endDuration * clip.playbackRate),
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
    };
    additions.push(right);
    return { ...clip, timelineDurationMs: offset, sourceDurationMs: leftSourceDuration };
  });
  next.clips = normalizeOrders([...next.clips, ...additions]);
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
  next.clips = normalizeOrders(normalizeGroups(next.clips.filter((clip) => !ids.has(clip.id))));
  const usedAssets = new Set(next.clips.flatMap((clip) => (clip.kind === 'caption' ? [] : [clip.assetId])));
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
    return { ...clip, transform: { ...transform } };
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
    return { ...clip, crop: crop ? { ...crop } : undefined };
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

export function reorderClip(composition: ClipComposition, clipId: string, targetIndex: number): ClipComposition {
  const next = clone(composition);
  const ordered = normalizeOrders(next.clips);
  const index = ordered.findIndex((clip) => clip.id === clipId);
  if (index < 0 || !Number.isInteger(targetIndex)) throw new CompositionEngineError('Invalid clip reorder.');
  const [clip] = ordered.splice(index, 1);
  ordered.splice(Math.max(0, Math.min(ordered.length, targetIndex)), 0, clip);
  next.clips = ordered.map((entry, order) => ({ ...entry, order }));
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
