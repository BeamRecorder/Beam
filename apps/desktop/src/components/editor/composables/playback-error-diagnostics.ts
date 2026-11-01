import type { InjectionKey } from 'vue';
import type { MediaError } from '@beam/runtime/shared/index';
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
  const data = asset?.sessionId && asset.sessionId !== context.editorData?.sessionId ? null : context.editorData;
  const manifest = data?.manifest;
  return {
    project: context.project,
    recordingSession: data
      ? {
          id: data.sessionId,
          completed: data.manifest.completed,
          ...(manifest?.platform ? { platform: manifest.platform } : {}),
          ...(manifest?.durationNs !== undefined ? { durationNs: manifest.durationNs } : {}),
          ...(manifest?.warnings ? { warnings: manifest.warnings } : {}),
          ...(manifest?.tracks
            ? {
                tracks: manifest.tracks.map(
                  ({ trackId, kind, format, metrics, status, terminationReason, segments }) => ({
                    trackId,
                    kind,
                    format,
                    metrics,
                    status,
                    terminationReason,
                    segments: segments.map(({ path, startNs, endNs, complete, encoding }) => ({
                      path,
                      startNs,
                      endNs,
                      complete,
                      ...(encoding ? { encoding } : {}),
                    })),
                  }),
                ),
              }
            : {}),
        }
      : null,
    media: {
      id: error.sourceId,
      name: asset?.name ?? null,
      expectedProjectPath,
    },
    error: playbackErrorDetails(error),
    ...(data?.diagnostics ? { diagnostics: data.diagnostics } : {}),
  };
}
