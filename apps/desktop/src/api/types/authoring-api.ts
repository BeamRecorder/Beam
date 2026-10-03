import type { DocumentRequest, DocumentResponse } from '@beam/engine/document/endpoint-types';
import type { HtmlComposition } from '@beam/engine/html/html-types';
import type { HttpFrameSourceDescriptor } from '@beam/runtime/frames/frame-source-types';

export interface AuthoringContext {
  projectId: string;
  kind: 'image' | 'video';
  name: string;
}
export interface AuthoringMessage {
  id: string;
  request: DocumentRequest;
}
export interface AuthoringApi {
  registerAuthoringDocument(context: AuthoringContext | null): Promise<void>;
  onAuthoringRequest(listener: (message: AuthoringMessage) => void): () => void;
  replyAuthoringRequest(id: string, response: DocumentResponse): void;
  renderHtmlFrame(html: HtmlComposition, timeMs: number): Promise<Uint8Array>;
  getHtmlPreviewSource(html: HtmlComposition): Promise<string>;
  getHtmlFrameSources(assets: { id: string; html?: HtmlComposition }[]): Promise<HttpFrameSourceDescriptor[]>;
}
