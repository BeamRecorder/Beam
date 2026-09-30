import type { InjectionKey } from 'vue';
import type { MediaError } from '~/media/shared';
import type { PlaybackErrorContext, PlaybackErrorReport } from './playback-error-types';

export const PLAYBACK_ERROR_REPORT: InjectionKey<PlaybackErrorReport> = Symbol('playback-error-report');

export const playbackErrorDetails = (error: MediaError) => ({
  kind: error.kind,
  sourceId: error.sourceId,
  message: error.message,
  ...('track' in error ? { track: error.track } : {}),
  ...('codec' in error ? { codec: error.codec } : {}),
  ...(error.context ? { context: error.context } : {}),
});

export function playbackErrorDiagnostic(error: MediaError, context: PlaybackErrorContext) {
  const asset = context.composition.assets.find((entry) => entry.id === error.sourceId);
  let expectedProjectPath: string | null = null;
  if (asset?.origin === 'session' && asset.sessionId && asset.sessionPath)
    expectedProjectPath = `session-${asset.sessionId}/${asset.sessionPath}`;
  else if (asset?.fileName) expectedProjectPath = `media/${asset.fileName}`;
  return {
    project: context.project,
    recordingSession: context.editorData
      ? { id: context.editorData.sessionId, completed: context.editorData.manifest.completed }
      : null,
    media: { id: error.sourceId, name: asset?.name ?? null, expectedProjectPath },
    error: playbackErrorDetails(error),
  };
}
