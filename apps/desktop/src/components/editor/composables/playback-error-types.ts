import type { MediaError } from '@beam/runtime/shared/index';
import type { ClipComposition } from '@beam/engine/shared/composition-types';

export type PlaybackErrorTranslate = (key: string, params?: Record<string, unknown>) => string;

export interface PlaybackErrorContext {
  project: { id: string; name: string } | null;
  editorData: { sessionId: string; manifest: { completed: boolean } } | null;
  composition: ClipComposition;
}

export type PlaybackErrorReport = (error: MediaError) => string;
