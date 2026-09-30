import { describe, expect, it } from 'vitest';
import type { MediaError } from '~/media/shared';
import { emptyComposition, type MediaAsset } from '~/media/shared/composition-types';
import { playbackErrorDetails, playbackErrorDiagnostic } from './playback-error-diagnostics';
import type { PlaybackErrorContext } from './playback-error-types';

const error: MediaError = { kind: 'decode-failure', sourceId: 'screen', message: 'Error during flush.' };
const asset: MediaAsset = {
  id: 'screen',
  kind: 'video',
  name: 'Screen recording',
  fileName: 'segment.mp4',
  durationMs: 1_000,
  width: 1_920,
  height: 1_080,
  src: 'project-media://asset/screen',
  origin: 'session',
  sessionId: 'session-1',
  sessionPath: 'screen/segment.mp4',
};
const context = (): PlaybackErrorContext => ({
  project: { id: 'project-1', name: 'Soft Signal' },
  editorData: { sessionId: 'session-1', manifest: { completed: true } },
  composition: { ...emptyComposition(), assets: [{ ...asset }] },
});

describe('playback error diagnostics', () => {
  it('keeps the error fields without attempting to serialize an opaque decoder cause', () => {
    const cause: { self?: unknown } = {};
    cause.self = cause;
    expect(playbackErrorDetails({ ...error, cause })).toEqual(error);
  });

  it('includes the missing track in the diagnostic', () => {
    const missing: MediaError = { kind: 'missing-track', sourceId: 'screen', track: 'video', message: 'No video' };
    expect(playbackErrorDetails(missing)).toEqual(missing);
  });

  it.each(['hvc1', null])('preserves the unsupported codec %s', (codec) => {
    const unsupported: MediaError = {
      kind: 'unsupported-codec',
      sourceId: 'screen',
      track: 'video',
      codec,
      message: 'Unsupported codec',
    };
    expect(playbackErrorDetails(unsupported)).toEqual(unsupported);
  });

  it('includes the project, recording completion and exact session-relative asset path', () => {
    expect(playbackErrorDiagnostic(error, context())).toEqual({
      project: { id: 'project-1', name: 'Soft Signal' },
      recordingSession: { id: 'session-1', completed: true },
      media: { id: 'screen', name: 'Screen recording', expectedProjectPath: 'session-session-1/screen/segment.mp4' },
      error,
    });
  });

  it('uses the imported asset’s project-relative path', () => {
    const current = context();
    current.composition.assets[0] = { ...asset, origin: 'project', fileName: 'import.mp4' };
    expect(playbackErrorDiagnostic(error, current).media.expectedProjectPath).toBe('media/import.mp4');
  });

  it.each([{ sessionId: undefined }, { sessionPath: undefined }, { fileName: null, sessionPath: undefined }])(
    'reports only known path information for an incomplete asset reference %j',
    (patch) => {
      const current = context();
      current.composition.assets[0] = { ...asset, ...patch };
      expect(playbackErrorDiagnostic(error, current).media.expectedProjectPath).toBe(
        patch.fileName === null ? null : 'media/segment.mp4',
      );
    },
  );

  it('leaves unidentified playback media and absent project/session context explicitly null', () => {
    const current = context();
    current.project = null;
    current.editorData = null;
    expect(playbackErrorDiagnostic({ ...error, sourceId: 'playback' }, current)).toMatchObject({
      project: null,
      recordingSession: null,
      media: { id: 'playback', name: null, expectedProjectPath: null },
    });
  });
});
