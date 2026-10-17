import type { Clip } from '../shared/composition-types';
import type { RecordingClipLink } from './recording-media-link-types';

/** Each connected recording group shares one document-ordered member array. */
export function recordingLinkComponents(clips: readonly Clip[], links: readonly RecordingClipLink[]) {
  const parents = new Map(clips.map((clip) => [clip.id, clip.id]));
  const root = (id: string) => {
    let current = id;
    while (parents.get(current) !== current) current = parents.get(current)!;
    while (id !== current) {
      const parent = parents.get(id)!;
      parents.set(id, current);
      id = parent;
    }
    return current;
  };
  const join = (left: string, right: string) => parents.set(root(left), root(right));
  const groups = new Map<string, string>();
  for (const clip of clips) {
    if (!clip.groupId) continue;
    const first = groups.get(clip.groupId);
    if (first) join(clip.id, first);
    else groups.set(clip.groupId, clip.id);
  }
  for (const { clip, owner } of links) if (owner) join(clip.id, owner.id);
  const members = new Map<string, Clip[]>();
  for (const clip of clips) {
    const id = root(clip.id);
    const component = members.get(id);
    if (component) component.push(clip);
    else members.set(id, [clip]);
  }
  return new Map(clips.map((clip) => [clip.id, members.get(root(clip.id))!]));
}
