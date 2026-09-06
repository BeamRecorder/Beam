import { clipEndMs, type Clip, type ClipComposition, type VisualClip } from '~/media/shared/composition-types';

export function recordingMediaOwner(composition: ClipComposition, clip: Clip): VisualClip | null {
  if (
    clip.recordingClipId === null ||
    !(clip.kind === 'webcam' || (clip.kind === 'audio' && ['microphone', 'system'].includes(clip.role)))
  )
    return null;
  const session = composition.assets.find((asset) => asset.id === clip.assetId)?.sessionId;
  if (!session) return null;
  const assets = new Set(composition.assets.filter((asset) => asset.sessionId === session).map((asset) => asset.id));
  const screens = composition.clips.filter(
    (item): item is VisualClip => item.kind === 'screen' && assets.has(item.assetId),
  );
  if (clip.recordingClipId) return screens.find((screen) => screen.id === clip.recordingClipId) ?? null;
  const midpoint = (clip.timelineStartMs + clipEndMs(clip)) / 2;
  return (
    screens.find((screen) => midpoint >= screen.timelineStartMs && midpoint < clipEndMs(screen)) ??
    (screens.length === 1 ? screens[0]! : null)
  );
}

export function recordingLinkedClipIds(composition: ClipComposition, selectedIds: readonly string[]): string[] {
  const ids = new Set(selectedIds);
  const links = composition.clips.map((clip) => ({ clip, owner: recordingMediaOwner(composition, clip) }));
  let changed = true;
  while (changed) {
    const size = ids.size;
    const groups = new Set(
      composition.clips.filter((clip) => ids.has(clip.id) && clip.groupId).map((clip) => clip.groupId),
    );
    for (const { clip, owner } of links) {
      if (clip.groupId && groups.has(clip.groupId)) ids.add(clip.id);
      if (owner && (ids.has(owner.id) || ids.has(clip.id))) {
        ids.add(owner.id);
        ids.add(clip.id);
      }
    }
    changed = ids.size !== size;
  }
  return [...ids];
}
