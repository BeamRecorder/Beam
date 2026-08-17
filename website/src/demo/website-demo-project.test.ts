import { describe, expect, it } from 'vitest';
import { createDefaultCaptionStyle, createDefaultClipAppearance } from '~/media/shared/composition-defaults';
import { COMPOSITION_SCHEMA_VERSION } from '~/media/shared/composition-types';
import { loadWebsiteDemoProject, WEBSITE_DEMO_FILES, type WebsiteDemoFileKey } from './website-demo-project';

const SESSION_ID = 'homepage-session';
const DURATION_MS = 10_800;

type ResponseMap = Map<string, Response>;

const okResponse = (value: unknown, contentType = 'application/json'): Response =>
  new Response(JSON.stringify(value), {
    status: 200,
    headers: { 'content-type': contentType },
  });

const invalidJsonResponse = (): Response =>
  new Response('{invalid-json', {
    status: 200,
    headers: { 'content-type': 'application/json' },
  });

const missingResponse = (status = 404): Response => new Response(null, { status });

const createFetcher = (responses: ResponseMap) => {
  const requested: string[] = [];
  const fetcher = (async (input: RequestInfo | URL) => {
    const path = typeof input === 'string' ? input : input.toString();
    requested.push(path);
    return responses.get(path) ?? missingResponse();
  }) as typeof fetch;
  return { fetcher, requested };
};

const pathFor = (key: WebsiteDemoFileKey) => WEBSITE_DEMO_FILES.find((file) => file.key === key)!.path;

const screenClip = {
  id: 'screen-source',
  kind: 'screen' as const,
  name: 'Recorded screen',
  assetId: 'original-screen-asset',
  timelineStartMs: 0,
  timelineDurationMs: DURATION_MS,
  sourceInMs: 0,
  sourceDurationMs: DURATION_MS,
  playbackRate: 1,
  enabled: true,
  order: 0,
  transform: { x: 0, y: 0, width: 1, height: 1 },
  appearance: createDefaultClipAppearance('screen'),
  isMirrored: false,
  isMirroredY: false,
};

const audioClip = {
  id: 'audio-source',
  kind: 'audio' as const,
  name: 'Recorded audio',
  assetId: 'original-screen-asset',
  timelineStartMs: 0,
  timelineDurationMs: DURATION_MS,
  sourceInMs: 0,
  sourceDurationMs: DURATION_MS,
  playbackRate: 1,
  enabled: true,
  order: 1,
  role: 'imported' as const,
  volume: 100,
};

const captionClip = {
  id: 'caption-source',
  kind: 'caption' as const,
  name: 'Intro caption',
  timelineStartMs: 1_000,
  timelineDurationMs: 1_500,
  sourceInMs: 0,
  sourceDurationMs: 1_500,
  playbackRate: 1,
  enabled: true,
  order: 2,
  caption: {
    type: 'text' as const,
    sentences: [
      {
        id: 'sentence-1',
        text: 'Record. Edit. Share.',
        startMs: 1_000,
        endMs: 2_500,
        words: [],
      },
    ],
    style: createDefaultCaptionStyle(42),
  },
};

const zoom = {
  id: 'zoom-1',
  sessionId: SESSION_ID,
  startMs: 2_000,
  endMs: 4_500,
  focus: { cx: 0.42, cy: 0.56 },
  depth: 2 as const,
  mode: 'manual' as const,
};

const cursorEvents = [
  {
    event: 'shape' as const,
    sessionNs: 0,
    cursorId: 'cursor-default',
    cursorKind: 'default' as const,
    hotspot: { x: 10, y: 7 },
  },
  {
    event: 'move' as const,
    sessionNs: 0,
    pixelX: 384,
    pixelY: 648,
    normalizedX: 0.2,
    normalizedY: 0.6,
    visible: true,
  },
  {
    event: 'button' as const,
    sessionNs: 2_000_000_000,
    button: 1,
    pressed: true,
    normalizedX: 0.42,
    normalizedY: 0.56,
  },
];

const telemetry = {
  version: 2,
  samples: [
    { timeMs: 0, cx: 0.2, cy: 0.6, interactionType: 'move' as const, cursorType: 'default' },
    { timeMs: 2_000, cx: 0.42, cy: 0.56, interactionType: 'click' as const, cursorType: 'default' },
  ],
};

const shapes = {
  'cursor-default': {
    cursorKind: 'default',
    nativeCursorId: 'arrow',
    hotspot: { x: 10, y: 7 },
  },
};

const createBundleResponses = (): ResponseMap => {
  const project = {
    schemaVersion: 2,
    projectId: 'homepage-project',
    sessions: [{ sessionId: SESSION_ID }],
    editor: {
      composition: {
        schemaVersion: COMPOSITION_SCHEMA_VERSION,
        assets: [
          {
            id: 'original-screen-asset',
            kind: 'video',
            name: 'Original recording',
            fileName: 'original.mp4',
            durationMs: DURATION_MS,
            width: 1920,
            height: 1080,
            src: 'project-media://original-screen-asset',
            origin: 'session',
          },
        ],
        clips: [screenClip, captionClip, audioClip],
        keyboardCaptionSessions: [],
      },
      zoom: { elements: [zoom] },
    },
  };
  const manifest = {
    schemaVersion: 2,
    projectId: 'homepage-project',
    sessionId: SESSION_ID,
    createdAtUtc: '2026-01-01T00:00:00.000Z',
    sessionStartMonotonicNs: 0,
    durationNs: DURATION_MS * 1_000_000,
    platform: { os: 'macos' },
    selectedSources: { screen: 'display-1' },
    tracks: [
      {
        trackId: 'screen-track',
        kind: 'screen',
        sourceId: 'display-1',
        format: { width: 1920, height: 1080 },
        segments: [
          {
            path: 'screen/BeamVideo.mp4',
            startNs: 0,
            endNs: DURATION_MS * 1_000_000,
            complete: true,
          },
        ],
        assets: [],
        metrics: {},
        status: 'completed',
        terminationReason: null,
      },
    ],
    permissions: {},
    warnings: [],
    completed: true,
  };

  return new Map([
    [pathFor('project'), okResponse(project)],
    [pathFor('manifest'), okResponse(manifest)],
    [pathFor('video'), okResponse('video bytes', 'video/mp4')],
    [pathFor('cursor'), okResponse(cursorEvents)],
    [pathFor('telemetry'), okResponse(telemetry)],
    [pathFor('shapes'), okResponse(shapes)],
  ]);
};

describe('loadWebsiteDemoProject', () => {
  it('reports every demo file when the public bundle is missing', async () => {
    const { fetcher, requested } = createFetcher(new Map());

    const result = await loadWebsiteDemoProject(fetcher);

    expect(result.status).toBe('incomplete');
    expect(result.project).toBeNull();
    expect(result.issues).toHaveLength(WEBSITE_DEMO_FILES.length);
    expect(result.issues).toEqual(
      WEBSITE_DEMO_FILES.map((file) => expect.objectContaining({ key: file.key, path: file.path, reason: 'missing' })),
    );
    expect(requested).toEqual(WEBSITE_DEMO_FILES.map((file) => file.path));
  });

  it('reports invalid JSON without hiding the offending file', async () => {
    const responses = createBundleResponses();
    responses.set(pathFor('project'), invalidJsonResponse());
    const { fetcher } = createFetcher(responses);

    const result = await loadWebsiteDemoProject(fetcher);

    expect(result.status).toBe('incomplete');
    expect(result.project).toBeNull();
    expect(result.issues).toEqual([
      expect.objectContaining({
        key: 'project',
        path: pathFor('project'),
        reason: 'invalid',
        detail: 'Invalid JSON',
      }),
    ]);
  });

  it('reconstructs video, timeline, cursor, captions, and zoom data from a complete bundle', async () => {
    const { fetcher } = createFetcher(createBundleResponses());

    const result = await loadWebsiteDemoProject(fetcher);

    expect(result.status).toBe('ready');
    if (result.status !== 'ready') throw new Error('Expected a complete demo bundle.');

    expect(result.issues).toEqual([]);
    expect(result.project.durationMs).toBe(DURATION_MS);
    expect(result.project.zoomElements).toEqual([zoom]);

    const { composition, editorData } = result.project;
    const videoAssetId = `session:${SESSION_ID}:screen:BeamVideo.mp4`;
    expect(composition.assets).toEqual([
      expect.objectContaining({
        id: videoAssetId,
        kind: 'video',
        fileName: 'BeamVideo.mp4',
        durationMs: DURATION_MS,
        src: pathFor('video'),
        origin: 'session',
        sessionId: SESSION_ID,
        sessionPath: 'screen/BeamVideo.mp4',
      }),
    ]);

    expect(composition.clips).toHaveLength(3);
    expect(composition.clips).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: 'screen-source',
          kind: 'screen',
          assetId: videoAssetId,
          timelineDurationMs: DURATION_MS,
          sourceDurationMs: DURATION_MS,
        }),
        expect.objectContaining({
          id: 'caption-source',
          kind: 'caption',
          timelineStartMs: 1_000,
          timelineDurationMs: 1_500,
          caption: expect.objectContaining({
            type: 'text',
            sentences: [expect.objectContaining({ text: 'Record. Edit. Share.' })],
          }),
        }),
        expect.objectContaining({
          id: 'audio-source',
          kind: 'audio',
          assetId: videoAssetId,
          role: 'imported',
          volume: 100,
        }),
      ]),
    );

    expect(editorData.sessionId).toBe(SESSION_ID);
    expect(editorData.videoSrc).toBe(pathFor('video'));
    expect(editorData.manifest.durationNs).toBe(DURATION_MS * 1_000_000);
    expect(editorData.recordedPlatform).toBe('macos');
    expect(editorData.cursor.events).toEqual(cursorEvents);
    expect(editorData.cursor.telemetry).toEqual(telemetry.samples);
    expect(editorData.cursor.catalog).toEqual({
      'cursor-default': {
        cursorKind: 'default',
        nativeCursorId: 'arrow',
        hotspot: { x: 10, y: 7 },
      },
    });
    expect(editorData.zoom.elements).toEqual([zoom]);
    expect(editorData.tracks).toEqual([
      expect.objectContaining({
        trackId: 'screen-track',
        kind: 'screen',
        assets: [
          expect.objectContaining({
            path: 'screen/BeamVideo.mp4',
            src: pathFor('video'),
            endNs: DURATION_MS * 1_000_000,
            complete: true,
            exists: true,
          }),
        ],
      }),
    ]);
  });
});
