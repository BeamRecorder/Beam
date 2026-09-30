import type { MediaError } from '~/media/shared';
import type { ClipComposition } from '~/media/shared/composition-types';

export type PlaybackErrorTranslate = (key: string, params?: Record<string, unknown>) => string;

export interface PlaybackErrorContext {
  project: { id: string; name: string } | null;
  editorData: { sessionId: string; manifest: { completed: boolean } } | null;
  composition: ClipComposition;
}

export type PlaybackErrorReport = (error: MediaError) => string;
