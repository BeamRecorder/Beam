import { describe, expect, it } from 'vitest';
import type { MediaError } from '@beam/runtime/shared/index';
import { emptyComposition, type MediaAsset } from '@beam/engine/shared/composition-types';
import { playbackErrorDetails, playbackErrorDiagnostic } from './playback-error-diagnostics';
import type { PlaybackErrorContext } from './playback-error-types';
import type { SessionTrackData } from '@beam/engine/capture/capture-session';

const error: MediaError = {
  kind: 'decode-failure',
  sourceId: 'screen',
  message: 'Error during flush.',
};
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
  it('includes persisted Windows encoder timings, track failures, warnings and file inspection in copied JSON', () => {
    const current = context();
    const track: SessionTrackData = {
      trackId: 'screen-track',
      kind: 'screen',
      sourceId: 'display:1',
      format: { codec: 'h264', width: 1920, height: 1080, nominalFps: 60 },
      metrics: { framesAcquired: 57_600, framesSubmitted: 57_599, framesProcessed: 57_599, framesDropped: 1 },
      status: 'failed',
      terminationReason: 'Windows encoder did not finish within 60 seconds',
      assets: [],
      segments: [
        {
          path: 'screen/segment.mp4',
          startNs: 0,
          endNs: null,
          complete: false,
          src: null,
          exists: true,
          encoding: {
            backend: 'windows-media-transcoder',
            codec: 'h264',
            requestedMode: 'software',
            width: 1920,
            height: 1080,
            fps: 60,
            bitrateBps: 12_000_000,
            queueCapacity: 3,
            initializationMs: 800,
            initializationError: null,
            attempts: [
              { requestedMode: 'accelerated', elapsedMs: 500, error: 'type rejected' },
              { requestedMode: 'software', elapsedMs: 300, error: null },
            ],
            finalization: { elapsedMs: 60_001, timeoutMs: 60_000, success: false, error: 'encoder timeout' },
          },
        },
      ],
    };
    current.editorData!.manifest = {
      completed: true,
      platform: { os: 'windows', architecture: 'x86_64', backend: 'windows-graphics-capture' },
      durationNs: 960_000_000_000,
      warnings: ['track shutdown reported: encoder timeout'],
      tracks: [track],
    };
    current.editorData!.diagnostics = {
      sampledAt: '2026-10-31T12:00:00Z',
      environment: {
        beamVersion: '0.5.8',
        electronVersion: '44',
        chromiumVersion: '148',
        platform: 'win32',
        osRelease: '10.0.26100',
        architecture: 'x64',
        cpuModel: 'Test CPU',
        logicalCpuCount: 4,
        totalMemoryBytes: 8 * 2 ** 30,
        availableMemoryBytes: 2 ** 30,
      },
      assets: [
        {
          trackId: 'screen-track',
          path: 'screen/segment.mp4',
          sizeBytes: 1_340_000_000,
          mp4: { status: 'headers-read', boxes: [{ type: 'mdat', offset: 40, size: 1_339_999_960 }] },
        },
      ],
    };
    const report = JSON.parse(JSON.stringify(playbackErrorDiagnostic(error, current)));
    expect(report.recordingSession).toMatchObject({
      completed: true,
      platform: { os: 'windows' },
      durationNs: 960_000_000_000,
      warnings: ['track shutdown reported: encoder timeout'],
    });
    const reported = report.recordingSession.tracks[0];
    expect(reported.status).toBe('failed');
    expect(reported.metrics).toEqual(track.metrics);
    expect(reported.segments[0].encoding).toEqual(track.segments[0]!.encoding);
    expect(reported.segments[0]).not.toHaveProperty('src');
    expect(report.diagnostics).toEqual(current.editorData!.diagnostics);
  });

  it('preserves old and non-Windows track data without inventing encoder measurements', () => {
    const current = context();
    current.editorData!.manifest = {
      completed: false,
      platform: { os: 'linux' },
      durationNs: 0,
      warnings: [],
      tracks: [
        {
          trackId: 'screen',
          kind: 'screen',
          sourceId: null,
          format: {},
          status: 'interrupted',
          terminationReason: null,
          metrics: {},
          assets: [],
          segments: [],
        },
      ],
    };
    const report = playbackErrorDiagnostic(error, current);
    expect(report.recordingSession).toMatchObject({
      completed: false,
      platform: { os: 'linux' },
      durationNs: 0,
      warnings: [],
      tracks: [{ segments: [] }],
    });
    expect(report).not.toHaveProperty('diagnostics');
    expect(JSON.stringify(report)).not.toContain('windows-media-transcoder');
  });

  it('never attributes a different recording session’s diagnostics to the failed asset', () => {
    const current = context();
    current.editorData!.sessionId = 'different-session';
    expect(playbackErrorDiagnostic(error, current).recordingSession).toBeNull();
  });

  it('keeps the error fields without attempting to serialize an opaque decoder cause', () => {
    const cause: { self?: unknown } = {};
    cause.self = cause;
    expect(playbackErrorDetails({ ...error, cause })).toEqual(error);
  });

  it('includes the missing track in the diagnostic', () => {
    const missing: MediaError = {
      kind: 'missing-track',
      sourceId: 'screen',
      track: 'video',
      message: 'No video',
    };
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
      media: {
        id: 'screen',
        name: 'Screen recording',
        expectedProjectPath: 'session-session-1/screen/segment.mp4',
      },
      error,
    });
  });

  it('uses the imported asset’s project-relative path', () => {
    const current = context();
    current.composition.assets[0] = {
      ...asset,
      origin: 'project',
      fileName: 'import.mp4',
    };
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
