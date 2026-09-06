import {
  clipEndMs,
  isAudioClip,
  isCaptionClip,
  isCompositingClip,
  isColorClip,
  isShapeClip,
  type Clip,
  type ClipComposition,
  type MediaAsset,
} from '~/media/shared/composition-types';
import { EMPTY_CLIP_TRANSITIONS, normalizeClipTransitions } from '~/media/shared/clip-transitions';
import { CompositionEngineError, MIN_CLIP_DURATION_MS, validateComposition } from './clip-composition-validation';
import { normalizeClipOrders } from './visual-track-layout';

export interface PasteClipOptions {
  timelineStartMs: number;
  timelineDurationMs: number;
  targetTrackId?: string | null;
  asset?: MediaAsset | null;
  idFactory?: () => string;
}

export interface PasteClipResult {
  composition: ClipComposition;
  clipId: string;
}

const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;
const defaultIdFactory = () => crypto.randomUUID();

const withoutOrphanGroups = (clips: Clip[]): Clip[] => {
  const groupCounts = new Map<string, number>();
  for (const clip of clips) if (clip.groupId) groupCounts.set(clip.groupId, (groupCounts.get(clip.groupId) ?? 0) + 1);
  return clips.map((clip) =>
    clip.groupId && groupCounts.get(clip.groupId) === 1 ? { ...clip, groupId: undefined } : clip,
  );
};

const sharesPasteLane = (candidate: Clip, source: Clip, targetTrackId: string | null): boolean => {
  if (isCompositingClip(source))
    return isCompositingClip(candidate) && candidate.trackId === (targetTrackId ?? source.trackId);
  if (isCaptionClip(source)) return isCaptionClip(candidate) && candidate.caption.type === source.caption.type;
  if (isAudioClip(source))
    return (
      isAudioClip(candidate) &&
      candidate.role === source.role &&
      (source.role !== 'imported' || candidate.assetId === source.assetId)
    );
  return false;
};

const transitionEdges = (clip: Clip, entry: boolean, exit: boolean, durationMs: number) =>
  normalizeClipTransitions(
    {
      entry: entry ? (clip.transitions?.entry ?? null) : null,
      exit: exit ? (clip.transitions?.exit ?? null) : null,
    },
    durationMs,
    clip.kind,
  );

const fragmentAt = (
  clip: Clip,
  startMs: number,
  durationMs: number,
  id: string,
  keepEntry: boolean,
  keepExit: boolean,
): Clip => {
  const elapsedMs = startMs - clip.timelineStartMs;
  const sourceDurationMs = Math.round(durationMs * clip.playbackRate);
  return {
    ...clip,
    id,
    groupId: undefined,
    timelineStartMs: startMs,
    timelineDurationMs: durationMs,
    sourceInMs: isCaptionClip(clip)
      ? 0
      : 'freezeFrameSourceMs' in clip && clip.freezeFrameSourceMs !== undefined
        ? clip.freezeFrameSourceMs
        : clip.sourceInMs + Math.round(elapsedMs * clip.playbackRate),
    sourceDurationMs,
    transitions: transitionEdges(clip, keepEntry, keepExit, durationMs),
  };
};

const overwriteClip = (clip: Clip, startMs: number, endMs: number, idFactory: () => string): Clip[] => {
  const end = clipEndMs(clip);
  if (end <= startMs || clip.timelineStartMs >= endMs) return [clip];
  const leftDuration = startMs - clip.timelineStartMs;
  const rightDuration = end - endMs;
  const fragments: Clip[] = [];
  if (leftDuration >= MIN_CLIP_DURATION_MS)
    fragments.push(fragmentAt(clip, clip.timelineStartMs, leftDuration, clip.id, true, false));
  if (rightDuration >= MIN_CLIP_DURATION_MS)
    fragments.push(fragmentAt(clip, endMs, rightDuration, fragments.length ? idFactory() : clip.id, false, true));
  return fragments;
};

export function pasteClipAt(
  composition: ClipComposition,
  copiedClip: Clip,
  options: PasteClipOptions,
): PasteClipResult {
  const startMs = Math.round(options.timelineStartMs);
  const durationMs = Math.round(copiedClip.timelineDurationMs);
  const timelineDurationMs = Math.round(options.timelineDurationMs);
  if (!Number.isFinite(startMs) || startMs < 0 || !Number.isFinite(timelineDurationMs) || timelineDurationMs <= 0)
    throw new CompositionEngineError('Invalid paste position.');
  if (durationMs < MIN_CLIP_DURATION_MS || startMs + durationMs > timelineDurationMs)
    throw new CompositionEngineError('The copied item does not fit at the playhead.');

  const targetTrackId = isCompositingClip(copiedClip)
    ? options.targetTrackId?.trim() || copiedClip.trackId || null
    : null;
  if (isCompositingClip(copiedClip) && !targetTrackId)
    throw new CompositionEngineError('The copied visual has no valid destination track.');

  const next = clone(composition);
  if (
    !isCaptionClip(copiedClip) &&
    !isColorClip(copiedClip) &&
    !isShapeClip(copiedClip) &&
    copiedClip.kind !== 'blur'
  ) {
    const existingAsset = next.assets.some((asset) => asset.id === copiedClip.assetId);
    if (!existingAsset && options.asset?.id === copiedClip.assetId) next.assets.push(clone(options.asset));
    if (!next.assets.some((asset) => asset.id === copiedClip.assetId))
      throw new CompositionEngineError('The copied media is no longer available in this project.');
  }

  const idFactory = options.idFactory ?? defaultIdFactory;
  const pastedId = idFactory();
  const endMs = startMs + durationMs;
  const untouched: Clip[] = [];
  const laneClips: Clip[] = [];
  for (const clip of next.clips) {
    if (sharesPasteLane(clip, copiedClip, targetTrackId))
      laneClips.push(...overwriteClip(clip, startMs, endMs, idFactory));
    else untouched.push(clip);
  }

  const destinationOrder = isCompositingClip(copiedClip)
    ? (next.clips.find((clip) => isCompositingClip(clip) && clip.trackId === targetTrackId)?.order ?? copiedClip.order)
    : copiedClip.order;
  const pasted: Clip = {
    ...clone(copiedClip),
    recordingClipId: null,
    id: pastedId,
    groupId: undefined,
    timelineStartMs: startMs,
    order: destinationOrder,
    transitions: normalizeClipTransitions(
      copiedClip.transitions ?? EMPTY_CLIP_TRANSITIONS,
      durationMs,
      copiedClip.kind,
    ),
    ...(isCompositingClip(copiedClip) ? { trackId: targetTrackId! } : {}),
  };
  next.clips = normalizeClipOrders(withoutOrphanGroups([...untouched, ...laneClips, pasted]));
  if (isCaptionClip(pasted) && pasted.caption.type === 'keyboard')
    next.keyboardCaptionSessions = [...new Set([...next.keyboardCaptionSessions, pasted.caption.sourceSessionId])];
  validateComposition(next);
  return { composition: next, clipId: pastedId };
}
