import type { DocumentSession } from './document-types';
import type { DocumentRequest, DocumentResponse, DocumentEvent } from './endpoint-types';
import { createTransactionChannel } from './transaction-channel';
import { createObserverErrors } from './observer-errors';
import { jsonObject } from './json-value';

/** Framework/transport independent endpoint; hosts own transport, persistence and observer error reporting. */
export function createDocumentEndpoint<T>(documentId: string, session: DocumentSession<T>) {
  const channel = createTransactionChannel(documentId, session);
  const observers = createObserverErrors();
  const listeners = new Set<(event: DocumentEvent<T>) => void>();
  const historyRequests = new Map<string, { serialized: string; response: DocumentResponse }>();
  let queue = Promise.resolve();
  const publish = (event: DocumentEvent<T>) => {
    for (const listener of listeners) {
      try {
        listener(event);
      } catch (error) {
        observers.record(error);
      }
    }
  };
  channel.subscribe(publish);
  const receive = async (input: unknown): Promise<DocumentResponse> => {
    let id: string | null = null;
    try {
      const value = jsonObject(input);
      if (value.version !== 1 || typeof value.id !== 'string' || !value.id)
        throw new TypeError('Invalid protocol envelope.');
      id = value.id;
      const request = value as unknown as DocumentRequest;
      if (request.method === 'snapshot')
        return {
          version: 1,
          id,
          ok: true,
          result: { documentId, revision: session.revision, document: session.document },
        };
      if (request.method === 'transaction')
        return { version: 1, id, ok: true, result: channel.apply(request.transaction) };
      if (request.method !== 'undo' && request.method !== 'redo') throw new TypeError('Unknown document method.');
      const serialized = JSON.stringify(value),
        previous = historyRequests.get(id);
      if (previous) {
        if (serialized !== previous.serialized) throw new Error('History request id was reused.');
        return previous.response;
      }
      if (request.expectedRevision !== session.revision) throw new Error('Revision conflict.');
      const previousRevision = session.revision;
      await session[request.method]();
      const response: DocumentResponse = {
        version: 1,
        id,
        ok: true,
        result: {
          documentId,
          revision: session.revision,
          document: session.document,
        },
      };
      historyRequests.set(id, { serialized, response });
      if (historyRequests.size > 512) historyRequests.delete(historyRequests.keys().next().value!);
      if (session.revision !== previousRevision)
        publish(
          Object.freeze({
            version: 1,
            documentId,
            requestId: id,
            method: request.method,
            previousRevision,
            revision: session.revision,
            document: session.document,
          }),
        );
      return response;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return {
        version: 1,
        id,
        ok: false,
        error: {
          code: message.startsWith('Revision conflict') ? 'revision-conflict' : 'invalid-request',
          message,
        },
      };
    }
  };
  return {
    subscribe(listener: (event: DocumentEvent<T>) => void) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    takeObserverErrors: () => [...session.takeObserverErrors(), ...channel.takeObserverErrors(), ...observers.take()],
    receive(input: unknown): Promise<DocumentResponse> {
      const response = queue.then(() => receive(input));
      queue = response.then(() => undefined);
      return response;
    },
  };
}
