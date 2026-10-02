import type { DocumentSession, DocumentSessionOptions } from './document-types';
import type { DocumentCommand } from '../commands/command-types';
import { createSnapshotHistory } from '../history/snapshot-history';
import { freezeDocument } from './immutable-document';

/** One owner, one revision per committed transaction; failed batches leave document/history untouched. */
export function createDocumentSession<T extends object>(
  initial: T,
  options: DocumentSessionOptions<T>,
): DocumentSession<T> {
  options.validate(initial);
  let document = freezeDocument(JSON.parse(JSON.stringify(initial)) as T);
  let revision = 0;
  const listeners = new Set<() => void>();
  const publish = (next: T) => {
    document = next;
    revision += 1;
    for (const listener of listeners) listener();
  };
  const history = createSnapshotHistory<T>({ onRestoreSnapshot: publish, immutable: true });
  history.initialize(document);
  const transaction = (commands: readonly DocumentCommand[]) => {
    if (history.state.restoring) throw new Error('Cannot edit during history restoration.');
    if (!commands.length) return;
    let next = document;
    for (const command of commands) next = options.commands.execute(next, command);
    options.validate(next);
    const previousHead = history.state.undo.at(-1);
    history.record(freezeDocument(next));
    if (history.state.undo.at(-1) !== previousHead) publish(next);
  };
  return {
    get document() {
      return document;
    },
    get revision() {
      return revision;
    },
    get canUndo() {
      return !history.state.restoring && history.state.undo.length > 1;
    },
    get canRedo() {
      return !history.state.restoring && history.state.redo.length > 0;
    },
    execute: (command) => transaction([command]),
    transaction,
    undo: history.undo,
    redo: history.redo,
    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
  };
}
