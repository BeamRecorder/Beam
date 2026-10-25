import type { Clip, ClipComposition } from '../shared/composition-types';
import { CompositionEngineError } from '../commands/clip-composition-validation';
import { validateSceneEdit } from '../scene/scene-edit';
import { selectionHasLocks, TimelineLockedError } from '../composition/timeline-locks';

export function screenCursorEnabled(clip: Clip | null | undefined, defaultEnabled = true): boolean {
  return clip?.kind === 'screen' && (clip.showCursor ?? defaultEnabled);
}

export function compositionHasScreenCursor(composition: ClipComposition, defaultEnabled = true): boolean {
  return composition.clips.some((clip) => clip.enabled && screenCursorEnabled(clip, defaultEnabled));
}

/** One immutable edit/undo step; linked sidecars and unselected split fragments are untouched. */
export function setScreenCursorVisibility(
  composition: ClipComposition,
  clipIds: readonly string[],
  enabled: boolean,
): ClipComposition {
  if (typeof enabled !== 'boolean') throw new CompositionEngineError('Invalid screen cursor visibility.');
  const ids = new Set(clipIds);
  const clips = composition.clips.map((clip) =>
    clip.kind === 'screen' && ids.has(clip.id) && clip.showCursor !== enabled ? { ...clip, showCursor: enabled } : clip,
  );
  if (clips.every((clip, index) => clip === composition.clips[index])) return composition;
  if (selectionHasLocks(composition, [], { clipIds: [...ids], zoomIds: [] }))
    throw new TimelineLockedError('Cannot change cursor visibility on locked clips.');
  const next = { ...composition, clips };
  validateSceneEdit(next, composition);
  return next;
}
