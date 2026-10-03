import type { SceneClipFragment } from './scene-types';
import type { Clip, ClipComposition } from '../shared/composition-types';
import { validateComposition } from '../commands/clip-composition-validation';

/** Keep authored hierarchy and animations attached to surviving and newly split track fragments. */
export function validateSceneEdit(
  next: ClipComposition,
  before: ClipComposition,
  fragments: ReadonlyMap<string, SceneClipFragment> = new Map(),
) {
  if (
    next.clips.length === before.clips.length &&
    next.clips.every((clip, index) => clip.id === before.clips[index]!.id)
  ) {
    validateComposition(next);
    return;
  }
  const previous = new Map(before.clips.map((clip) => [clip.id, clip]));
  const additions = next.clips.filter((clip) => !previous.has(clip.id));
  const additionsBySource = new Map<string, Clip[]>();
  for (const clip of additions) {
    const fragment = fragments.get(clip.id);
    if (!fragment) continue;
    const entries = additionsBySource.get(fragment.sourceId) ?? [];
    entries.push(clip);
    additionsBySource.set(fragment.sourceId, entries);
  }
  if (before.scene) {
    const groupIds = new Set(before.scene.groups.map((group) => group.id));
    const current = new Set(next.clips.map((clip) => clip.id));
    const assigned = new Set<string>();
    const members = (ids: string[]) =>
      ids.flatMap((id) => {
        if (!current.has(id) && !groupIds.has(id)) return [];
        const source = previous.get(id);
        const siblings = source
          ? (additionsBySource.get(source.id) ?? []).filter((clip) => !assigned.has(clip.id))
          : [];
        for (const sibling of siblings) assigned.add(sibling.id);
        return [id, ...siblings.map((clip) => clip.id)];
      });
    const groups = before.scene.groups.map((group) => ({ ...group, children: members(group.children) }));
    next.scene = { ...before.scene, roots: members(before.scene.roots), groups };
  }
  if (before.animations) {
    const ids = new Set([...next.clips.map((clip) => clip.id), ...(next.scene?.groups.map((group) => group.id) ?? [])]);
    const tracks = before.animations.tracks.filter((track) => ids.has(track.targetId));
    const trackIds = new Set(tracks.map((track) => track.id));
    const byTarget = new Map<string, typeof tracks>();
    for (const track of before.animations.tracks) {
      const entries = byTarget.get(track.targetId) ?? [];
      entries.push(track);
      byTarget.set(track.targetId, entries);
    }
    let sequence = 0;
    for (const clip of additions) {
      const fragment = fragments.get(clip.id);
      const source = fragment ? previous.get(fragment.sourceId) : undefined;
      if (!source) continue;
      for (const track of byTarget.get(source.id) ?? []) {
        let id: string;
        do {
          id = `split-animation-${sequence++}`;
        } while (trackIds.has(id));
        trackIds.add(id);
        tracks.push({
          ...track,
          id,
          targetId: clip.id,
          ...(track.timeSpace === 'local' ? { timeOffsetMs: (track.timeOffsetMs ?? 0) + fragment!.localOffsetMs } : {}),
        });
      }
    }
    next.animations = { ...before.animations, tracks };
  }
  validateComposition(next);
}
