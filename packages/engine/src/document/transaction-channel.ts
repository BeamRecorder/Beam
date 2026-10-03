import type { DocumentSession } from './document-types';
import type { DocumentTransaction, DocumentTransactionEvent } from './transaction-types';
import { createObserverErrors } from './observer-errors';
import { assertJsonValue } from './json-value';
import { freezeDocument } from './immutable-document';

/** Ordered transactions with bounded retry deduplication; no network or CRDT implementation is implied. */
export function createTransactionChannel<T>(documentId: string, session: DocumentSession<T>) {
  if (!documentId) throw new TypeError('Document channel requires an id.');
  const observerErrors = createObserverErrors();
  const applied = new Map<string, { serialized: string; event: DocumentTransactionEvent }>();
  const listeners = new Set<(event: DocumentTransactionEvent) => void>();
  return {
    apply(transaction: DocumentTransaction): DocumentTransactionEvent {
      assertJsonValue(transaction);
      if (
        transaction.version !== 1 ||
        transaction.documentId !== documentId ||
        typeof transaction.operationId !== 'string' ||
        !transaction.operationId ||
        typeof transaction.actorId !== 'string' ||
        !transaction.actorId ||
        !Number.isSafeInteger(transaction.expectedRevision) ||
        transaction.expectedRevision < 0 ||
        !Array.isArray(transaction.commands) ||
        transaction.commands.length > 1000
      )
        throw new TypeError('Invalid document transaction.');
      for (const command of transaction.commands)
        if (!command || typeof command.type !== 'string' || !('payload' in command))
          throw new TypeError('Invalid command envelope.');
      const serialized = JSON.stringify(transaction);
      const previous = applied.get(transaction.operationId);
      if (previous) {
        if (previous.serialized !== serialized) throw new Error('Operation id was reused for another transaction.');
        return previous.event;
      }
      if (transaction.expectedRevision !== session.revision)
        throw new Error(`Revision conflict: expected ${transaction.expectedRevision}, current ${session.revision}.`);
      const previousRevision = session.revision;
      session.transaction(transaction.commands);
      const event: DocumentTransactionEvent = Object.freeze({
        version: 1,
        documentId,
        operationId: transaction.operationId,
        actorId: transaction.actorId,
        previousRevision,
        revision: session.revision,
        commands: freezeDocument(JSON.parse(JSON.stringify(transaction.commands)) as typeof transaction.commands),
      });
      applied.set(transaction.operationId, { serialized, event });
      if (applied.size > 512) applied.delete(applied.keys().next().value!);
      for (const listener of listeners) {
        try {
          listener(event);
        } catch (error) {
          observerErrors.record(error);
        }
      }
      return event;
    },
    takeObserverErrors: observerErrors.take,
    subscribe(listener: (event: DocumentTransactionEvent) => void) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
  };
}
