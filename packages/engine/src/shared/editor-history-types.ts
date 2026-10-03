/** JSON-safe snapshot history. The current state is the last undo entry. */
export interface SnapshotHistory<T> {
  version: 1;
  undo: T[];
  redo: T[];
}
