import type { Clip, ClipComposition } from '../shared/composition-types';
import type { CursorPresentationSettings, ScreenCursorSettings } from './cursor-presentation';
import { screenCursorEnabled } from './screen-cursor';
import { validateScreenCursorSettings } from './screen-cursor-schema';
import { selectionHasLocks, TimelineLockedError } from '../composition/timeline-locks';
import { validateComposition } from '../commands/clip-composition-validation';

export function screenCursorPresentation(
  clip: Clip | null | undefined,
  defaults: CursorPresentationSettings,
): CursorPresentationSettings {
  return {
    ...(clip?.kind === 'screen' ? (clip.cursorSettings ?? defaults) : defaults),
    enabled: screenCursorEnabled(clip, defaults.enabled),
  };
}

export function setScreenCursorSettings(
  composition: ClipComposition,
  ids: readonly string[],
  settings: ScreenCursorSettings,
): ClipComposition {
  validateScreenCursorSettings(settings);
  const selected = new Set(ids);
  if (selectionHasLocks(composition, [], { clipIds: [...selected], zoomIds: [] }))
    throw new TimelineLockedError('Cannot change cursor settings on locked clips.');
  const owned: ScreenCursorSettings = JSON.parse(JSON.stringify(settings));
  const clips = composition.clips.map((clip) =>
    clip.kind === 'screen' && selected.has(clip.id) && JSON.stringify(clip.cursorSettings) !== JSON.stringify(settings)
      ? { ...clip, cursorSettings: owned }
      : clip,
  );
  if (clips.every((clip, index) => clip === composition.clips[index])) return composition;
  const next = { ...composition, clips };
  validateComposition(next);
  return next;
}

export function cursorImageKey(packId: string, assetId: string, color: string): string {
  return JSON.stringify([packId, assetId, color]);
}
