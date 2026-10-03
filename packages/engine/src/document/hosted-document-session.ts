import type { HostedDocumentOptions } from './hosted-document-types';
import type { DocumentCommand } from '../commands/command-types';
import { createObserverErrors } from './observer-errors';

/** Adapts an active host document without introducing a second undo stack. */
export function createHostedDocumentSession<T extends object>(options: HostedDocumentOptions<T>) {
  let revision = 0;
  let serialized = JSON.stringify(options.read());
  let changing = false;
  let publishing = false;
  const listeners = new Set<() => void>();
  const errors = createObserverErrors();
  const refresh = () => {
    if (changing) return;
    const next = JSON.stringify(options.read());
    if (next === serialized) return;
    serialized = next;
    revision++;
    publishing = true;
    try {
      for (const listener of listeners) {
        try {
          listener();
        } catch (error) {
          errors.record(error);
        }
      }
    } finally {
      publishing = false;
    }
  };
  const editable = () => {
    if (changing || publishing || !options.canEdit())
      throw new Error('The document is busy; finish the current gesture or edit and retry.');
  };
  const transaction = (commands: readonly DocumentCommand[]) => {
    editable();
    refresh();
    if (!commands.length) return;
    let next = JSON.parse(JSON.stringify(options.read())) as T;
    for (const command of commands) next = options.commands.execute(next, command);
    options.validate(next);
    changing = true;
    try {
      options.apply(next);
    } finally {
      changing = false;
      refresh();
    }
  };
  const restore = async (method: 'undo' | 'redo') => {
    editable();
    changing = true;
    try {
      await options[method]();
    } finally {
      changing = false;
      refresh();
    }
  };
  return {
    get document() {
      refresh();
      return JSON.parse(JSON.stringify(options.read())) as T;
    },
    get revision() {
      refresh();
      return revision;
    },
    get canUndo() {
      return options.canUndo();
    },
    get canRedo() {
      return options.canRedo();
    },
    execute: (command: DocumentCommand) => transaction([command]),
    transaction,
    undo: () => restore('undo'),
    redo: () => restore('redo'),
    refresh,
    takeObserverErrors: errors.take,
    subscribe(listener: () => void) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
  };
}
