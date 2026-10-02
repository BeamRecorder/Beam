import type { CommandHandler, CommandRegistry, DocumentCommand } from './command-types';

/** Extensions validate their own payload and return a new document, without mutating the input. */
export function createCommandRegistry<Document>(): CommandRegistry<Document> {
  const handlers = new Map<string, (document: Document, payload: unknown) => Document>();
  return {
    register<Payload>(handler: CommandHandler<Document, Payload>) {
      if (!handler.type.trim() || handlers.has(handler.type))
        throw new Error(`Duplicate or empty command: ${handler.type}`);
      handlers.set(handler.type, (document, payload) => handler.apply(document, handler.parse(payload)));
    },
    execute(document: Document, command: DocumentCommand) {
      const handler = handlers.get(command.type);
      if (!handler) throw new Error(`Unknown command: ${command.type}`);
      return handler(document, command.payload);
    },
    get types() {
      return [...handlers.keys()];
    },
  };
}
