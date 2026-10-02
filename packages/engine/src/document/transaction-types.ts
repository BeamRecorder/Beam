import type { DocumentCommand } from '../commands/command-types';

export interface DocumentTransaction {
  version: 1;
  documentId: string;
  operationId: string;
  actorId: string;
  expectedRevision: number;
  commands: readonly DocumentCommand[];
}
export interface DocumentTransactionEvent {
  version: 1;
  documentId: string;
  operationId: string;
  actorId: string;
  previousRevision: number;
  revision: number;
  commands: readonly DocumentCommand[];
}
