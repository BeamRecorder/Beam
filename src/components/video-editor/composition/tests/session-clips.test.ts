import { describe, expect, it } from 'vitest';
import type { ProjectEditorData, SessionTrackAsset, SessionTrackData } from '../../../../api/types/capture-api';
import { emptyComposition, type ClipComposition } from '../composition-types';
import { synchronizeRecordingClips } from '../session-clips';

const segment = (overrides: Partial<SessionTrackAsset> = {}): SessionTrackAsset => ({
  path: 'segment.webm',
  startNs: 0,
  endNs: 2_000_000_000,
  complete: true,
  src: '/segment.webm',
  exists: true,
  ...overrides,
});

const track = (
  kind: SessionTrackData['kind'],
  assets: SessionTrackAsset[],
  format: Record<string, unknown> = {},
  status = 'completed',
): SessionTrackData => ({
  trackId: kind,
  kind,
  sourceId: kind,
  format,
  segments: assets,
  assets,
  metrics: {},
  status,
  terminationReason: null,
});

const editorData = (tracks: SessionTrackData[], videoSrc: string | null = null): ProjectEditorData => ({
  sessionId: 'session-1',
  videoSrc,
  manifest: {
    schemaVersion: 1,
    projectId: 'project',
    sessionId: 'session-1',
    createdAtUtc: '',
    sessionStartMonotonicNs: 0,
    durationNs: 2_000_000_000,
    platform: {},
    selectedSources: {},
    tracks,
    permissions: {},
    warnings: [],
    completed: true,
  },
  tracks,
  cursor: {
    available: false,
    events: [],
    telemetry: [],
    shapes: {},
    catalog: {},
    missing: [],
  },
  zoom: { elements: [], generatedSessions: [] },
});

describe('synchronizeRecordingClips', () => {
  it('returns the original composition without editor data', () => {
    const composition = emptyComposition();
    expect(synchronizeRecordingClips(composition, null)).toBe(composition);
    expect(synchronizeRecordingClips(composition, undefined)).toBe(composition);
  });

  it('creates visual and audio clips, normalizes durations and groups synchronized tracks', () => {
    const screen = segment({ path: 'screen.webm', src: '/screen.webm' });
    const camera = segment({ path: 'camera.webm', src: '/camera.webm' });
    const system = segment({
      path: 'system.opus',
      startNs: 500_000_000,
      endNs: null,
      src: '/system.opus',
    });
    const microphone = segment({
      path: 'mic.opus',
      endNs: 1_000_000,
      src: '/mic.opus',
    });
    const result = synchronizeRecordingClips(
      emptyComposition(),
      editorData([
        track('screen', [screen], { width: 1920, height: 1080 }),
        track('camera', [camera], {
          width: 640,
          height: 480,
          placement: { x: 0.1, y: 0.2, width: 0.3, height: 0.4 },
        }),
        track('system-audio', [system]),
        track('microphone', [microphone]),
        track('cursor', [segment()]),
        track('camera', [segment({ path: 'failed.webm' })], {}, 'failed'),
      ]),
    );

    expect(result.clips).toHaveLength(4);
    const screenClip = result.clips.find((clip) => clip.kind === 'screen')!;
    const cameraClip = result.clips.find((clip) => clip.kind === 'webcam')!;
    const audioClips = result.clips.filter((clip) => clip.kind === 'audio');
    expect(screenClip.id).toBe('screen');
    expect(cameraClip).toMatchObject({
      transform: { x: 0.1, y: 0.2, width: 0.3, height: 0.4 },
    });
    expect(cameraClip.groupId).toBe(screenClip.groupId);
    expect(cameraClip.groupId).toContain('recording:session-1:0:2000');
    expect(audioClips.map((clip) => clip.role)).toEqual(['system', 'microphone']);
    expect(audioClips[0]!.timelineStartMs).toBe(500);
    expect(audioClips[1]!.timelineDurationMs).toBe(40);
    expect(result.assets.find((asset) => asset.kind === 'video' && asset.src === '/screen.webm')?.width).toBe(1920);
    expect(result.assets.find((asset) => asset.src === '/mic.opus')?.width).toBeNull();
  });

  it('skips incomplete assets and creates a primary screen fallback when needed', () => {
    const invalid = segment({ complete: false });
    const missing = segment({ exists: false, path: 'missing.webm' });
    const noSource = segment({ src: null, path: 'no-source.webm' });
    const result = synchronizeRecordingClips(
      emptyComposition(),
      editorData(
        [
          track('screen', [invalid, missing, noSource]),
          track('camera', [segment({ path: 'camera.webm', src: '/camera.webm' })], { placement: { x: 'bad' } }),
        ],
        '/primary.mp4',
      ),
    );

    expect(result.clips).toHaveLength(2);
    expect(result.clips.find((clip) => clip.kind === 'screen')).toMatchObject({
      id: 'screen',
      timelineDurationMs: 2000,
      assetId: 'session:session-1:screen:primary',
    });
    expect(result.clips.find((clip) => clip.kind === 'webcam')).toMatchObject({
      transform: { x: 0.72, y: 0.72, width: 0.24, height: 0.24 },
    });
    expect(result.assets.some((asset) => asset.src === '/primary.mp4')).toBe(true);
  });

  it('preserves existing clips and does not duplicate recording sources', () => {
    const composition: ClipComposition = {
      ...emptyComposition(),
      assets: [
        {
          id: 'old',
          kind: 'image',
          name: 'Old',
          fileName: null,
          durationMs: 1000,
          width: 10,
          height: 10,
          src: '/old.png',
          origin: 'project',
        },
      ],
      clips: [
        {
          id: 'screen',
          kind: 'screen',
          name: 'Trimmed screen',
          assetId: 'old',
          timelineStartMs: 200,
          timelineDurationMs: 400,
          sourceInMs: 100,
          sourceDurationMs: 400,
          playbackRate: 1,
          enabled: true,
          order: 1,
          transform: { x: 0, y: 0, width: 1, height: 1 },
        },
      ],
    };
    const result = synchronizeRecordingClips(composition, editorData([track('screen', [segment()])]));
    expect(result.clips.filter((clip) => clip.id === 'screen')).toHaveLength(1);
    expect(result.clips[0]!.name).toBe('Trimmed screen');
    expect(result.assets.some((asset) => asset.src === '/segment.webm')).toBe(true);
  });
});
