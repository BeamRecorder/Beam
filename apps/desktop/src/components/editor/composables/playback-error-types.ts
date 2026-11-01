import type { MediaError } from '@beam/runtime/shared/index';
import type { ClipComposition } from '@beam/engine/shared/composition-types';
import type { ProjectEditorData, SessionManifestData } from '@beam/engine/capture/capture-session';

export type PlaybackErrorTranslate = (key: string, params?: Record<string, unknown>) => string;

export interface PlaybackErrorContext {
  project: { id: string; name: string } | null;
  editorData: {
    sessionId: string;
    manifest: Pick<SessionManifestData, 'completed'> & Partial<SessionManifestData>;
    diagnostics?: ProjectEditorData['diagnostics'];
  } | null;
  composition: ClipComposition;
}

export type PlaybackErrorReport = (error: MediaError) => string;
