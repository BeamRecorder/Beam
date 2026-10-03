import type { SnapshotHistory } from '../shared/editor-history-types';
import type { EditorHistoryOptions, HistoryState, SnapshotHistoryEngine, SnapshotOwnership } from './history-types';

export const MAX_HISTORY_DEPTH = 50;
const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;

/** Owns serializable snapshots. Scheduling, shortcuts and reactive bindings belong to the host. */
export function createSnapshotHistory<T extends object>(options: EditorHistoryOptions<T>): SnapshotHistoryEngine<T> {
  const copy = (snapshot: T) => (options.immutable ? snapshot : clone(snapshot));
  let state: HistoryState<T> = { undo: [], redo: [], lastAction: null, restoring: false };
  let serializedHead: { snapshot: T; json: string } | null = null;
  const listeners = new Set<() => void>();
  const publish = (next: HistoryState<T>) => {
    state = next;
    for (const listener of listeners) listener();
  };
  const initialize = (snapshot: T, history?: SnapshotHistory<T>, ownership: SnapshotOwnership = 'copy') => {
    if (state.restoring) throw new Error('Cannot initialize history during restoration.');
    serializedHead = null;
    const valid =
      history?.version === 1 &&
      Array.isArray(history.undo) &&
      Array.isArray(history.redo) &&
      history.undo.length > 0 &&
      history.undo.length + history.redo.length <= MAX_HISTORY_DEPTH &&
      JSON.stringify(history.undo.at(-1)) === JSON.stringify(snapshot);
    publish({
      undo: valid ? (ownership === 'transfer' ? history.undo : history.undo.map(copy)) : [copy(snapshot)],
      redo: valid ? (ownership === 'transfer' ? history.redo : clone(history.redo)) : [],
      lastAction: null,
      restoring: false,
    });
  };
  const record = (snapshot: T) => {
    if (state.restoring) return;
    const head = state.undo.at(-1);
    if (options.immutable) {
      if (head !== snapshot) publish({ ...state, undo: [...state.undo, snapshot].slice(-MAX_HISTORY_DEPTH), redo: [] });
      return;
    }
    const json = JSON.stringify(snapshot);
    if (head && serializedHead?.snapshot !== head) serializedHead = { snapshot: head, json: JSON.stringify(head) };
    if (head && serializedHead?.json === json) return;
    const next = JSON.parse(json) as T;
    serializedHead = { snapshot: next, json };
    publish({ ...state, undo: [...state.undo, next].slice(-MAX_HISTORY_DEPTH), redo: [] });
  };
  const restore = async (type: 'undo' | 'redo') => {
    if (state.restoring || options.disabled?.()) return;
    const { undo, redo } = state;
    const snapshot = type === 'undo' ? undo.at(-2) : redo.at(-1);
    if (!snapshot) return;
    publish({ ...state, restoring: true });
    try {
      await options.onRestoreSnapshot(copy(snapshot));
      serializedHead = null;
      publish({
        undo: type === 'undo' ? undo.slice(0, -1) : [...undo, copy(snapshot)],
        redo: type === 'undo' ? [...redo, undo[undo.length - 1]!] : redo.slice(0, -1),
        restoring: true,
        lastAction: {
          type,
          timestamp: Date.now(),
          snapshots: {
            before: type === 'undo' ? snapshot : undo[undo.length - 1]!,
            after: type === 'undo' ? undo[undo.length - 1]! : snapshot,
          },
        },
      });
    } finally {
      publish({ ...state, restoring: false });
    }
  };
  return {
    get state() {
      return state;
    },
    initialize,
    record,
    serialize: () => clone({ version: 1, undo: state.undo, redo: state.redo }),
    undo: () => restore('undo'),
    redo: () => restore('redo'),
    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
  };
}
