import { toRaw } from 'vue';
import { freezeDocument } from '@beam/engine/document/immutable-document';
import type { EditorHistorySnapshots, EditorStateSnapshot } from './editor-history-types';
import type { ClipComposition } from '@beam/engine/shared/composition-types';

const presentationJson = (snapshot: EditorStateSnapshot) => JSON.stringify({ ...snapshot, composition: undefined });
const sameRecord = (left: unknown, right: unknown) => left === right || JSON.stringify(left) === JSON.stringify(right);
const sameComposition = (before: ClipComposition, next: ClipComposition) => {
  if (before === next) return true;
  if (before.clips.length !== next.clips.length || before.assets.length !== next.assets.length) return false;
  if (!before.clips.every((clip, index) => sameRecord(clip, next.clips[index]))) return false;
  if (!before.assets.every((asset, index) => sameRecord(asset, next.assets[index]))) return false;
  const keys = new Set([...Object.keys(before), ...Object.keys(next)] as Array<keyof ClipComposition>);
  return [...keys].every((key) => key === 'clips' || key === 'assets' || sameRecord(before[key], next[key]));
};

/** Own mutable controls once; share the immutable composition across history entries. */
export function createEditorHistorySnapshots(): EditorHistorySnapshots {
  let previous: EditorStateSnapshot | undefined;
  let previousPresentation = '';
  return {
    capture(snapshot) {
      const json = presentationJson(snapshot);
      const composition = toRaw(snapshot.composition);
      if (previous && previousPresentation === json && sameComposition(previous.composition, composition))
        return previous;
      previousPresentation = json;
      previous = freezeDocument({
        ...JSON.parse(json),
        composition: freezeDocument(composition),
      } as EditorStateSnapshot);
      return previous;
    },
    restore(snapshot) {
      previous = snapshot;
      previousPresentation = presentationJson(snapshot);
      // Restored controls become editable again without lending history's owned objects.
      return { ...JSON.parse(previousPresentation), composition: snapshot.composition } as EditorStateSnapshot;
    },
  };
}
