import {
  createCompositionCommands,
  createDocumentSession,
  createDocumentEndpoint,
  createAuthoringSession,
  validateComposition,
} from '@beam/engine';
import type { DocumentCommand, StillDocument } from '@beam/engine';
import { readDocumentFile } from './document-file';
import { createInterface } from 'node:readline';
import type { CompositionSnapshot } from '@beam/engine';

export function createDocumentHost(value: unknown) {
  if (value && typeof value === 'object' && 'kind' in value && value.kind === 'image') {
    const document = value as StillDocument;
    const session = createAuthoringSession(document);
    return {
      endpoint: createDocumentEndpoint(document.id, session),
      edit: (commands: DocumentCommand[]) => session.transaction(commands),
      get revision() {
        return session.revision;
      },
      get document() {
        return session.document;
      },
    };
  }
  const snapshot = value && typeof value === 'object' && 'snapshot' in value ? value.snapshot : value;
  if (snapshot && typeof snapshot === 'object' && 'render' in snapshot && 'canvas' in snapshot) {
    const session = createAuthoringSession(snapshot as CompositionSnapshot);
    const wrapped = snapshot !== value;
    return {
      endpoint: createDocumentEndpoint(
        value && typeof value === 'object' && 'documentId' in value && typeof value.documentId === 'string'
          ? value.documentId
          : 'document',
        session,
      ),
      edit: (commands: DocumentCommand[]) => session.transaction(commands),
      get revision() {
        return session.revision;
      },
      get document() {
        return wrapped ? { ...(value as object), snapshot: session.document } : session.document;
      },
    };
  }
  const file = readDocumentFile(value);
  const session = createDocumentSession(file.composition, {
    commands: createCompositionCommands(),
    validate: validateComposition,
  });
  const id =
    value && typeof value === 'object' && 'id' in value && typeof value.id === 'string' ? value.id : 'document';
  return {
    endpoint: createDocumentEndpoint(id, session),
    edit: (commands: DocumentCommand[]) => session.transaction(commands),
    get revision() {
      return session.revision;
    },
    get document() {
      return file.replace(session.document);
    },
  };
}

export async function serveDocument(value: unknown) {
  const host = createDocumentHost(value);
  const write = (value: unknown) => process.stdout.write(JSON.stringify(value) + '\n');
  const unsubscribe = host.endpoint.subscribe((event) => write({ version: 1, event }));
  const input = createInterface({ input: process.stdin, crlfDelay: Infinity });
  try {
    for await (const line of input) {
      if (!line.trim()) continue;
      try {
        write(await host.endpoint.receive(JSON.parse(line) as unknown));
        for (const error of host.endpoint.takeObserverErrors())
          process.stderr.write(`Document observer failed: ${String(error)}\n`);
      } catch (error) {
        write({
          version: 1,
          id: null,
          ok: false,
          error: { code: 'invalid-json', message: String(error) },
        });
      }
    }
  } finally {
    unsubscribe();
    input.close();
  }
}
