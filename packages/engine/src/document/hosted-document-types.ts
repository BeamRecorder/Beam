import type { DocumentSessionOptions } from './document-types';

/** The host retains its UI history and persistence; the engine validates external edits. */
export interface HostedDocumentOptions<T extends object> extends DocumentSessionOptions<T> {
  read(): T;
  apply(document: T): void;
  undo(): Promise<void>;
  redo(): Promise<void>;
  canUndo(): boolean;
  canRedo(): boolean;
  canEdit(): boolean;
}
