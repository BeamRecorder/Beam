import { forkComposition } from '../document/immutable-document';
import { validateSceneEdit } from '../scene/scene-edit';
import { byId, targetIds } from './clip-targets';
import { CompositionEngineError } from './clip-composition-validation';
import { normalizeClipOrders } from './visual-track-layout';
import { normalizeClipTransitions } from '../shared/clip-transitions';
import { isVisualClip, clipEndMs, type Clip, type ClipComposition } from '../shared/composition-types';
const clone = forkComposition<ClipComposition>;
const finite = Number.isFinite;
const integer = Math.round;
const createId = () => crypto.randomUUID();

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
  const rightIds = new Map<string, string>();
  next.clips = next.clips.map((clip) => {
    if (!ids.has(clip.id)) return clip;
    const leftSourceDuration = integer(offset * clip.playbackRate);
    const freezeFrameSourceMs = isVisualClip(clip) ? clip.freezeFrameSourceMs : undefined;
    const rightId = idFactory();
    rightIds.set(clip.id, rightId);
    const right: Clip = {
      ...clip,
      id: rightId,
      groupId: rightGroupId,
      timelineStartMs: target,
      timelineDurationMs: clip.timelineDurationMs - offset,
      sourceInMs: freezeFrameSourceMs ?? clip.sourceInMs + leftSourceDuration,
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
  for (const right of additions) {
    if (right.recordingClipId && rightIds.has(right.recordingClipId))
      right.recordingClipId = rightIds.get(right.recordingClipId);
  }
  next.clips = normalizeClipOrders([...next.clips, ...additions]);
  validateSceneEdit(
    next,
    composition,
    new Map([...rightIds].map(([sourceId, id]) => [id, { sourceId, localOffsetMs: offset }])),
  );
  return next;
}
