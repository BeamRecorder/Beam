import type { HostedDocumentOptions } from '@beam/engine/document/hosted-document-types';
import type { AuthoringContext } from '~/api/types/authoring-api';

export interface AuthoringHost<T extends object> extends HostedDocumentOptions<T> {
  context(): AuthoringContext | null;
  save(): Promise<unknown>;
}
