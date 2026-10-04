import type { SceneClipFragment } from '../scene/scene-types';
import { validateSceneEdit } from '../scene/scene-edit';
import { forkComposition } from '../document/immutable-document';
import { clipEndMs, isVisualClip, type Clip, type ClipComposition } from '@beam/engine/shared/composition-types';
import { normalizeClipTransitions } from '@beam/engine/shared/clip-transitions';
import { CompositionEngineError, MIN_CLIP_DURATION_MS } from '@beam/engine/commands/clip-composition-validation';
import { normalizeClipOrders } from '@beam/engine/commands/visual-track-layout';
import { downstreamVisualTrackRippleIds } from '@beam/engine/commands/visual-track-ripple';

export const HOLD_SEGMENT_DURATION_MS = 1_000;

const createId = (): string => crypto.randomUUID();
const isVideoClip = (composition: ClipComposition, clip: Clip) =>
  isVisualClip(clip) &&
  clip.kind !== 'image' &&
  composition.assets.some((asset) => asset.id === clip.assetId && asset.kind === 'video');

export function holdClipAtPlayhead(
  composition: ClipComposition,
  clipId: string,
  timelineTimeMs: number,
  idFactory: () => string = createId,
): ClipComposition {
  const next = forkComposition(composition);
  const source = next.clips.find((clip) => clip.id === clipId);
  if (!source) throw new CompositionEngineError(`Unknown clip: ${clipId}`);
  if (!isVideoClip(next, source) || (isVisualClip(source) && source.freezeFrameSourceMs !== undefined))
    throw new CompositionEngineError('Only video clips can be held.');

  const target = Math.round(timelineTimeMs);
  if (
    !Number.isFinite(target) ||
    target < source.timelineStartMs + MIN_CLIP_DURATION_MS ||
    target > clipEndMs(source) - MIN_CLIP_DURATION_MS
  )
    throw new CompositionEngineError('Hold must be inside the clip.');

  const targetIds = new Set(
    source.groupId ? next.clips.filter((clip) => clip.groupId === source.groupId).map((clip) => clip.id) : [source.id],
  );
  const heldTargets = next.clips.filter((clip) => targetIds.has(clip.id) && isVideoClip(next, clip));
  const rippleIds = downstreamVisualTrackRippleIds(next.clips, targetIds, target);
  const rightGroupId = source.groupId ? idFactory() : undefined;
  const holdGroupId = heldTargets.length > 1 ? idFactory() : undefined;
  const additions: Clip[] = [];
  const rightIds = new Map<string, string>();
  const fragments = new Map<string, SceneClipFragment>();

  next.clips = next.clips.map((clip) => {
    if (!targetIds.has(clip.id))
      return rippleIds.has(clip.id)
        ? { ...clip, timelineStartMs: clip.timelineStartMs + HOLD_SEGMENT_DURATION_MS }
        : clip;

    const offset = target - clip.timelineStartMs;
    const leftSourceDuration = Math.round(offset * clip.playbackRate);
    const rightDuration = clip.timelineDurationMs - offset;
    const rightId = idFactory();
    rightIds.set(clip.id, rightId);
    fragments.set(rightId, { sourceId: clip.id, localOffsetMs: offset });
    additions.push({
      ...clip,
      id: rightId,
      groupId: rightGroupId,
      timelineStartMs: target + HOLD_SEGMENT_DURATION_MS,
      timelineDurationMs: rightDuration,
      sourceInMs: clip.sourceInMs + leftSourceDuration,
      sourceDurationMs: clip.sourceDurationMs - leftSourceDuration,
      transitions: normalizeClipTransitions(
        { entry: null, exit: clip.transitions?.exit ?? null },
        rightDuration,
        clip.kind,
      ),
    });

    if (isVideoClip(next, clip) && isVisualClip(clip)) {
      const freezeFrameSourceMs = clip.sourceInMs + leftSourceDuration;
      const heldId = idFactory();
      fragments.set(heldId, { sourceId: clip.id, localOffsetMs: offset });
      additions.push({
        ...clip,
        id: heldId,
        groupId: holdGroupId,
        timelineStartMs: target,
        timelineDurationMs: HOLD_SEGMENT_DURATION_MS,
        sourceInMs: freezeFrameSourceMs,
        sourceDurationMs: HOLD_SEGMENT_DURATION_MS,
        playbackRate: 1,
        transitions: { entry: null, exit: null },
        freezeFrameSourceMs,
      });
    }

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
  validateSceneEdit(next, composition, fragments);
  return next;
}
