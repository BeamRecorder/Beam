import {
  captionLayerKey,
  clipEndMs,
  isCaptionClip,
  isCompositingClip,
  isColorClip,
  isShapeClip,
  type Clip,
  type ClipComposition,
} from '@beam/engine/shared/composition-types';
import { EMPTY_CLIP_TRANSITIONS, normalizeClipTransitions } from '@beam/engine/shared/clip-transitions';
import {
  CompositionEngineError,
  MIN_CLIP_DURATION_MS,
  validateComposition,
} from '@beam/engine/commands/clip-composition-validation';
import { normalizeClipOrders } from '@beam/engine/commands/visual-track-layout';
import type { ClipPasteLane, PasteClipOptions, PasteClipResult } from '@beam/engine/commands/clip-paste-types';
export type { PasteClipOptions, PasteClipResult } from '@beam/engine/commands/clip-paste-types';

const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;
const defaultIdFactory = () => crypto.randomUUID();

const withoutOrphanGroups = (clips: Clip[]): Clip[] => {
  const groupCounts = new Map<string, number>();
  for (const clip of clips) if (clip.groupId) groupCounts.set(clip.groupId, (groupCounts.get(clip.groupId) ?? 0) + 1);
  return clips.map((clip) =>
    clip.groupId && groupCounts.get(clip.groupId) === 1 ? { ...clip, groupId: undefined } : clip,
  );
};

const pasteLaneKey = (clip: Clip, targetTrackId?: string | null): string => {
  if (isCompositingClip(clip)) return `visual:${targetTrackId ?? clip.trackId}`;
  if (isCaptionClip(clip)) return `caption:${captionLayerKey(clip)}`;
  return `audio:${clip.role}:${clip.role === 'imported' ? clip.assetId : ''}`;
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
  const transaction = createClipPasteTransaction(composition);
  const clipId = transaction.paste(copiedClip, options);
  return { composition: transaction.finish(), clipId };
}

/** Stage only affected lanes; clone owned clipboard values and canonicalize/validate once at commit. */
export function createClipPasteTransaction(composition: ClipComposition) {
  const lanes = new Map<string, ClipPasteLane>();
  for (const clip of composition.clips) {
    const key = pasteLaneKey(clip);
    const lane = lanes.get(key);
    if (lane) {
      lane.clips.push(clip);
      lane.endMs = Math.max(lane.endMs, clipEndMs(clip));
    } else lanes.set(key, { clips: [clip], endMs: clipEndMs(clip) });
  }
  const assets = new Map(composition.assets.map((asset) => [asset.id, asset]));
  const sessions = new Set(composition.keyboardCaptionSessions);
  const paste = (copiedClip: Clip, options: PasteClipOptions): string => {
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

    if (
      !isCaptionClip(copiedClip) &&
      !isColorClip(copiedClip) &&
      !isShapeClip(copiedClip) &&
      copiedClip.kind !== 'blur'
    ) {
      if (!assets.has(copiedClip.assetId) && options.asset?.id === copiedClip.assetId)
        assets.set(copiedClip.assetId, clone(options.asset));
      if (!assets.has(copiedClip.assetId))
        throw new CompositionEngineError('The copied media is no longer available in this project.');
    }

    const idFactory = options.idFactory ?? defaultIdFactory;
    const pastedId = idFactory();
    const endMs = startMs + durationMs;
    const laneKey = pasteLaneKey(copiedClip, targetTrackId);
    const lane = lanes.get(laneKey) ?? { clips: [], endMs: 0 };
    const destinationOrder = isCompositingClip(copiedClip)
      ? (lane.clips[0]?.order ?? copiedClip.order)
      : copiedClip.order;
    // Ordered fragments on a new lane append in O(1), rather than rescanning every earlier paste.
    if (startMs < lane.endMs) {
      lane.clips = lane.clips.flatMap((clip) => overwriteClip(clip, startMs, endMs, idFactory));
      lane.endMs = lane.clips.reduce((end, clip) => Math.max(end, clipEndMs(clip)), 0);
    }

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
    lane.clips.push(pasted);
    lane.endMs = Math.max(lane.endMs, endMs);
    lanes.set(laneKey, lane);
    if (isCaptionClip(pasted) && pasted.caption.type === 'keyboard') sessions.add(pasted.caption.sourceSessionId);
    return pastedId;
  };
  const finish = (): ClipComposition => {
    const next = {
      ...composition,
      assets: [...assets.values()],
      keyboardCaptionSessions: [...sessions],
      clips: normalizeClipOrders(withoutOrphanGroups([...lanes.values()].flatMap((lane) => lane.clips))),
    };
    validateComposition(next);
    return next;
  };
  return { paste, finish };
}
