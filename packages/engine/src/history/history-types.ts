import type { SnapshotHistory } from '../shared/editor-history-types';

export type HistoryActionType = 'undo' | 'redo';
export interface HistoryAction {
  type: HistoryActionType;
  timestamp: number;
  snapshots?: { before: object; after: object };
}
export type SnapshotOwnership = 'copy' | 'transfer';
export type SnapshotSource<T> = T | (() => T);
export interface EditorHistoryOptions<T> {
  /** Inputs must be transitively immutable; retain references instead of serializing every edit. */
  immutable?: boolean;
  onRestoreSnapshot(snapshot: T): void | Promise<void>;
  disabled?: () => boolean;
}
export interface HistoryState<T> {
  undo: T[];
  redo: T[];
  lastAction: HistoryAction | null;
  restoring: boolean;
}
export interface SnapshotHistoryEngine<T> {
  readonly state: HistoryState<T>;
  initialize(snapshot: T, history?: SnapshotHistory<T>, ownership?: SnapshotOwnership): void;
  record(snapshot: T): void;
  serialize(): SnapshotHistory<T>;
  undo(): Promise<void>;
  redo(): Promise<void>;
  subscribe(listener: () => void): () => void;
}
