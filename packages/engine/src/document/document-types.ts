import type { CommandRegistry, DocumentCommand } from '../commands/command-types';
export interface DocumentSession<T> {
  readonly document: T;
  readonly revision: number;
  readonly canUndo: boolean;
  readonly canRedo: boolean;
  execute(command: DocumentCommand): void;
  transaction(commands: readonly DocumentCommand[]): void;
  undo(): Promise<void>;
  redo(): Promise<void>;
  takeObserverErrors(): unknown[];
  subscribe(listener: () => void): () => void;
}
export interface DocumentSessionOptions<T> {
  commands: CommandRegistry<T>;
  validate(document: T): void;
}
