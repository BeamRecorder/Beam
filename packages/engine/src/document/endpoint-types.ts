import type { DocumentTransaction } from './transaction-types';
export type DocumentRequest =
  | { version: 1; id: string; method: 'snapshot' }
  | {
      version: 1;
      id: string;
      method: 'transaction';
      transaction: DocumentTransaction;
    }
  | {
      version: 1;
      id: string;
      method: 'undo' | 'redo';
      expectedRevision: number;
    };
export type DocumentResponse =
  | { version: 1; id: string; ok: true; result: unknown }
  | {
      version: 1;
      id: string | null;
      ok: false;
      error: { code: string; message: string };
    };

export interface DocumentHistoryEvent<T> {
  version: 1;
  documentId: string;
  method: 'undo' | 'redo';
  requestId: string;
  previousRevision: number;
  revision: number;
  document: T;
}
export type DocumentEvent<T> = import('./transaction-types').DocumentTransactionEvent | DocumentHistoryEvent<T>;
