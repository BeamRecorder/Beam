import type { HtmlComposition } from '@beam/engine/html/html-types';
import type { DocumentCommand } from '@beam/engine/commands/command-types';
import type { CompositionSnapshot } from '@beam/engine/shared/render-document-types';
import type { StillDocument } from '@beam/engine/screenshot/still-document-types';

export interface AgentClient {
  call<T = unknown>(tool: string, arguments_: object): Promise<T>;
}
export interface ToolDefinition {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
  live: boolean;
}
export interface HtmlPublishArguments {
  projectId: string;
  expectedRevision: number;
  entry: string;
  width: number;
  height: number;
  durationMs: number;
  fps?: number;
  framework?: HtmlComposition['framework'];
  layerId?: string;
  name?: string;
  startMs?: number;
  references?: { name: string; source: string; projectId?: string }[];
}
export interface LiveDocumentSnapshot {
  documentId: string;
  revision: number;
  document: CompositionSnapshot | StillDocument;
}
export interface PublishResult {
  projectId: string;
  layerId: string;
  html: HtmlComposition;
  revision: number;
  commands: DocumentCommand[];
}
