export interface DocumentCommand {
  type: string;
  payload: unknown;
}
export interface CommandHandler<Document, Payload> {
  type: string;
  parse(payload: unknown): Payload;
  apply(document: Document, payload: Payload): Document;
}
export interface CommandRegistry<Document> {
  register<Payload>(handler: CommandHandler<Document, Payload>): void;
  execute(document: Document, command: DocumentCommand): Document;
  readonly types: readonly string[];
}
