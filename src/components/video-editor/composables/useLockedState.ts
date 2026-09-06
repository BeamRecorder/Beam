import { computed, shallowRef, type ShallowRef } from 'vue';
import { preservesLockedItems } from '../composition/timeline-locks';
import type { LockableTimelineItem } from '../composition/timeline-lock-types';

// Ordinary edits cannot change or remove locked content. Project loading and
// undo/redo use restore explicitly, because they replace the entire saved state.
export function useLockedState<T>(
  initial: T,
  items: (state: T) => readonly LockableTimelineItem[],
  preserves: (before: T, after: T) => boolean = () => true,
) {
  const value: ShallowRef<T> = shallowRef(initial);
  const state = computed<T>({
    get: () => value.value,
    set: (next: T) => {
      if (preservesLockedItems(items(value.value), items(next)) && preserves(value.value, next)) value.value = next;
    },
  });
  const restore = (next: T) => {
    value.value = next;
  };
  return { state, restore };
}
