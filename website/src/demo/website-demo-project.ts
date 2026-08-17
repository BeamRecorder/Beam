import type {
  CursorEvent,
  CursorShapeCatalogEntry,
  CursorTelemetryPoint,
  ProjectEditorData,
  SessionManifestData,
  SessionTrackData,
} from '~/api/types/capture-session';
import { createDefaultClipAppearance } from '~/media/shared/composition-defaults';
import { COMPOSITION_SCHEMA_VERSION, SCREEN_CLIP_ID, type ClipComposition } from '~/media/shared/composition-types';
import type { ZoomElement } from '~/components/video-editor/zoom/zoom-types';
import { websiteI18n } from '@website/i18n';

const t = websiteI18n.global.t;

export const WEBSITE_DEMO_ROOT = '/demo-project';

export const WEBSITE_DEMO_FILES = [
  { key: 'project', path: `${WEBSITE_DEMO_ROOT}/project.json`, description: 'Beam editor state and captions' },
  { key: 'manifest', path: `${WEBSITE_DEMO_ROOT}/session/manifest.json`, description: 'recording manifest' },
  { key: 'video', path: `${WEBSITE_DEMO_ROOT}/session/screen/BeamVideo.mp4`, description: 'screen recording' },
  { key: 'cursor', path: `${WEBSITE_DEMO_ROOT}/session/cursor/cursor.json`, description: 'cursor events' },
  {
    key: 'telemetry',
    path: `${WEBSITE_DEMO_ROOT}/session/cursor/telemetry.json`,
    description: 'cursor telemetry',
  },
  { key: 'shapes', path: `${WEBSITE_DEMO_ROOT}/session/cursor/shapes.json`, description: 'cursor shape catalog' },
] as const;

export type WebsiteDemoFileKey = (typeof WEBSITE_DEMO_FILES)[number]['key'];

export interface WebsiteDemoFileIssue {
  key: WebsiteDemoFileKey;
  path: string;
  description: string;
  reason: 'missing' | 'invalid';
  detail?: string;
}

export interface WebsiteDemoProject {
  composition: ClipComposition;
  editorData: ProjectEditorData;
  zoomElements: ZoomElement[];
  durationMs: number;
}

export type WebsiteDemoProjectResult =
  | { status: 'ready'; project: WebsiteDemoProject; issues: [] }
  | { status: 'incomplete'; project: null; issues: WebsiteDemoFileIssue[] };

type JsonRecord = Record<string, unknown>;

const isRecord = (value: unknown): value is JsonRecord =>
  Boolean(value) && typeof value === 'object' && !Array.isArray(value);

const fetchFile = async (file: (typeof WEBSITE_DEMO_FILES)[number], fetcher: typeof fetch) => {
  try {
    const response = await fetcher(file.path, { cache: 'no-store' });
    if (!response.ok) {
      return { file, issue: { ...file, reason: 'missing' as const, detail: `HTTP ${response.status}` } };
    }
    if (file.key === 'video') {
      const contentType = response.headers.get('content-type')?.toLowerCase() ?? '';
      if (contentType && !contentType.includes('video/mp4') && !contentType.includes('application/octet-stream')) {
        return {
          file,
          issue: {
            ...file,
            reason: 'invalid' as const,
            detail: t('Website.missing.expectedMp4', { type: contentType }),
          },
        };
      }
      return { file, value: file.path };
    }
    try {
      const source = await response.text();
      try {
        return { file, value: JSON.parse(source) };
      } catch {
        if (file.key !== 'cursor') throw new SyntaxError(t('Website.missing.invalidJson'));
        const events = source
          .split(/\r?\n/)
          .filter(Boolean)
          .map((line) => JSON.parse(line));
        if (!events.length) throw new SyntaxError(t('Website.missing.emptyCursor'));
        return { file, value: events };
      }
    } catch {
      return { file, issue: { ...file, reason: 'invalid' as const, detail: t('Website.missing.invalidJson') } };
    }
  } catch {
    return {
      file,
      issue: {
        ...file,
        reason: 'missing' as const,
        detail: t('Website.missing.requestFailed'),
      },
    };
  }
};

const durationFor = (manifest: JsonRecord) => {
  const durationNs = manifest.durationNs;
  return typeof durationNs === 'number' && Number.isFinite(durationNs) && durationNs > 0
    ? Math.max(40, Math.round(durationNs / 1_000_000))
    : null;
};

const isFiniteNumber = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value);

const validCursorEvents = (events: unknown[], durationMs: number) =>
  events.every((event) => {
    if (!isRecord(event) || !['move', 'shape', 'button', 'visibility'].includes(String(event.event))) return false;
    if (
      !isFiniteNumber(event.sessionNs) ||
      event.sessionNs < 0 ||
      event.sessionNs > durationMs * 1_000_000 + 1_000_000_000
    )
      return false;
    if (event.event === 'move')
      return (
        isFiniteNumber(event.normalizedX) &&
        event.normalizedX >= 0 &&
        event.normalizedX <= 1 &&
        isFiniteNumber(event.normalizedY) &&
        event.normalizedY >= 0 &&
        event.normalizedY <= 1 &&
        typeof event.visible === 'boolean'
      );
    return true;
  });

const validTelemetry = (value: JsonRecord, durationMs: number) =>
  value.version === 2 &&
  Array.isArray(value.samples) &&
  value.samples.every(
    (sample) =>
      isRecord(sample) &&
      isFiniteNumber(sample.timeMs) &&
      sample.timeMs >= 0 &&
      sample.timeMs <= durationMs + 1_000 &&
      isFiniteNumber(sample.cx) &&
      sample.cx >= 0 &&
      sample.cx <= 1 &&
      isFiniteNumber(sample.cy) &&
      sample.cy >= 0 &&
      sample.cy <= 1,
  );

const validZooms = (value: unknown, durationMs: number): value is ZoomElement[] =>
  Array.isArray(value) &&
  value.every(
    (zoom) =>
      isRecord(zoom) &&
      typeof zoom.id === 'string' &&
      typeof zoom.sessionId === 'string' &&
      isFiniteNumber(zoom.startMs) &&
      isFiniteNumber(zoom.endMs) &&
      zoom.startMs >= 0 &&
      zoom.endMs > zoom.startMs &&
      zoom.endMs <= durationMs &&
      isRecord(zoom.focus) &&
      isFiniteNumber(zoom.focus.cx) &&
      zoom.focus.cx >= 0 &&
      zoom.focus.cx <= 1 &&
      isFiniteNumber(zoom.focus.cy) &&
      zoom.focus.cy >= 0 &&
      zoom.focus.cy <= 1 &&
      [1, 2, 3, 4, 5, 6].includes(Number(zoom.depth)) &&
      ['auto', 'manual'].includes(String(zoom.mode)),
  );

const catalogFor = (metadata: JsonRecord): Record<string, CursorShapeCatalogEntry> =>
  Object.fromEntries(
    Object.entries(metadata).flatMap(([id, value]) => {
      if (!isRecord(value) || typeof value.cursorKind !== 'string' || typeof value.nativeCursorId !== 'string')
        return [];
      const hotspot = isRecord(value.hotspot) ? value.hotspot : {};
      return [
        [
          id,
          {
            cursorKind: value.cursorKind,
            nativeCursorId: value.nativeCursorId,
            hotspot: {
              x: typeof hotspot.x === 'number' ? hotspot.x : 0,
              y: typeof hotspot.y === 'number' ? hotspot.y : 0,
            },
          } as CursorShapeCatalogEntry,
        ],
      ];
    }),
  );

const compositionFor = (project: JsonRecord, durationMs: number, sessionId: string): ClipComposition | null => {
  const editor = isRecord(project.editor) ? project.editor : null;
  const saved = editor && isRecord(editor.composition) ? editor.composition : null;
  if (
    !saved ||
    saved.schemaVersion !== COMPOSITION_SCHEMA_VERSION ||
    !Array.isArray(saved.assets) ||
    !Array.isArray(saved.clips) ||
    !saved.clips.every(isRecord) ||
    !Array.isArray(saved.keyboardCaptionSessions)
  )
    return null;

  const videoAssetId = `session:${sessionId}:screen:BeamVideo.mp4`;
  const savedComposition = saved as unknown as ClipComposition;
  const captionClips = savedComposition.clips.filter((clip) => clip.kind === 'caption');
  const savedScreen = savedComposition.clips.find((clip) => clip.kind === 'screen');
  const savedAudio = savedComposition.clips.find((clip) => clip.kind === 'audio');
  const screen = savedScreen
    ? {
        ...savedScreen,
        assetId: videoAssetId,
        timelineDurationMs: Math.min(savedScreen.timelineDurationMs, durationMs),
        sourceDurationMs: Math.min(savedScreen.sourceDurationMs, durationMs),
      }
    : {
        id: SCREEN_CLIP_ID,
        kind: 'screen' as const,
        name: 'BeamVideo.mp4',
        assetId: videoAssetId,
        timelineStartMs: 0,
        timelineDurationMs: durationMs,
        sourceInMs: 0,
        sourceDurationMs: durationMs,
        playbackRate: 1,
        transitions: { entry: null, exit: null },
        enabled: true,
        order: 30_000,
        transform: { x: 0, y: 0, width: 1, height: 1 },
        appearance: createDefaultClipAppearance('screen'),
        isMirrored: false,
        isMirroredY: false,
      };
  const audio = savedAudio
    ? {
        ...savedAudio,
        assetId: videoAssetId,
        timelineDurationMs: Math.min(savedAudio.timelineDurationMs, durationMs),
        sourceDurationMs: Math.min(savedAudio.sourceDurationMs, durationMs),
      }
    : {
        id: `session:${sessionId}:audio:BeamVideo.mp4`,
        kind: 'audio' as const,
        name: 'BeamVideo.mp4 audio',
        assetId: videoAssetId,
        timelineStartMs: 0,
        timelineDurationMs: durationMs,
        sourceInMs: 0,
        sourceDurationMs: durationMs,
        playbackRate: 1,
        transitions: { entry: null, exit: null },
        enabled: true,
        order: 40_000,
        role: 'imported' as const,
        volume: 100,
      };

  return {
    schemaVersion: COMPOSITION_SCHEMA_VERSION,
    assets: [
      {
        id: videoAssetId,
        kind: 'video',
        name: 'BeamVideo.mp4',
        fileName: 'BeamVideo.mp4',
        durationMs,
        width: null,
        height: null,
        src: WEBSITE_DEMO_FILES.find((file) => file.key === 'video')!.path,
        origin: 'session',
        sessionId,
        sessionPath: 'screen/BeamVideo.mp4',
      },
    ],
    clips: [screen, ...captionClips, audio],
    keyboardCaptionSessions: Array.isArray(savedComposition.keyboardCaptionSessions)
      ? savedComposition.keyboardCaptionSessions
      : [],
  };
};

export async function loadWebsiteDemoProject(fetcher: typeof fetch = fetch): Promise<WebsiteDemoProjectResult> {
  const responses = await Promise.all(WEBSITE_DEMO_FILES.map((file) => fetchFile(file, fetcher)));
  const issues = responses.flatMap((response) => (response.issue ? [response.issue] : []));
  if (issues.length) return { status: 'incomplete', project: null, issues };

  const values = Object.fromEntries(responses.map((response) => [response.file.key, response.value]));
  const project = values.project;
  const manifest = values.manifest;
  const cursor = values.cursor;
  const telemetry = values.telemetry;
  const shapes = values.shapes;
  const invalid: WebsiteDemoFileIssue[] = [];
  const addInvalid = (key: WebsiteDemoFileKey, detail: string) => {
    const file = WEBSITE_DEMO_FILES.find((entry) => entry.key === key)!;
    invalid.push({ ...file, reason: 'invalid', detail });
  };

  const invalidDetail = t('Website.missing.invalid');
  if (!isRecord(project)) addInvalid('project', invalidDetail);
  if (!isRecord(manifest)) addInvalid('manifest', invalidDetail);
  if (!Array.isArray(cursor)) addInvalid('cursor', invalidDetail);
  if (!isRecord(telemetry) || !Array.isArray(telemetry.samples)) addInvalid('telemetry', invalidDetail);
  if (!isRecord(shapes)) addInvalid('shapes', invalidDetail);
  if (
    invalid.length ||
    !isRecord(project) ||
    !isRecord(manifest) ||
    !Array.isArray(cursor) ||
    !isRecord(telemetry) ||
    !isRecord(shapes)
  )
    return { status: 'incomplete', project: null, issues: invalid };

  const durationMs = durationFor(manifest);
  if (!durationMs) addInvalid('manifest', invalidDetail);
  if (![1, 2].includes(Number(project.schemaVersion))) addInvalid('project', invalidDetail);
  if (manifest.schemaVersion !== 2) addInvalid('manifest', invalidDetail);
  if (manifest.completed !== true) addInvalid('manifest', invalidDetail);
  const sessionId = typeof manifest.sessionId === 'string' && manifest.sessionId ? manifest.sessionId : null;
  if (!sessionId) addInvalid('manifest', invalidDetail);
  if (
    typeof project.projectId !== 'string' ||
    typeof manifest.projectId !== 'string' ||
    project.projectId !== manifest.projectId
  )
    addInvalid('manifest', invalidDetail);
  const projectSessions = Array.isArray(project.sessions) ? project.sessions : [];
  if (!sessionId || !projectSessions.some((session) => isRecord(session) && session.sessionId === sessionId))
    addInvalid('project', invalidDetail);
  const manifestTracks = Array.isArray(manifest.tracks) ? manifest.tracks : [];
  const rawScreenTrack = manifestTracks.find((track) => isRecord(track) && track.kind === 'screen');
  if (!isRecord(rawScreenTrack) || !Array.isArray(rawScreenTrack.segments)) addInvalid('manifest', invalidDetail);
  else if (!rawScreenTrack.segments.some((segment) => isRecord(segment) && segment.complete === true))
    addInvalid('manifest', invalidDetail);
  if (durationMs && !validCursorEvents(cursor, durationMs)) addInvalid('cursor', invalidDetail);
  if (durationMs && !validTelemetry(telemetry, durationMs)) addInvalid('telemetry', invalidDetail);
  const composition = durationMs && sessionId ? compositionFor(project, durationMs, sessionId) : null;
  if (!composition) addInvalid('project', invalidDetail);
  if (invalid.length || !durationMs || !sessionId || !composition)
    return { status: 'incomplete', project: null, issues: invalid };

  const projectEditor = project.editor as JsonRecord;
  const rawZoom =
    isRecord(projectEditor.zoom) && Array.isArray(projectEditor.zoom.elements) ? projectEditor.zoom.elements : [];
  const zoom = validZooms(rawZoom, durationMs) ? rawZoom : [];
  if (rawZoom.length && !zoom.length) {
    const file = WEBSITE_DEMO_FILES.find((entry) => entry.key === 'project')!;
    return {
      status: 'incomplete',
      project: null,
      issues: [{ ...file, reason: 'invalid', detail: invalidDetail }],
    };
  }
  const screenTrack = Array.isArray(manifest.tracks)
    ? (manifest.tracks as SessionTrackData[]).find((track) => track.kind === 'screen')
    : undefined;
  const videoPath = WEBSITE_DEMO_FILES.find((file) => file.key === 'video')!.path;
  const tracks: SessionTrackData[] = screenTrack
    ? [
        {
          ...screenTrack,
          assets: [
            {
              path: 'screen/BeamVideo.mp4',
              startNs: 0,
              endNs: manifest.durationNs as number,
              complete: true,
              src: videoPath,
              exists: true,
            },
          ],
        },
      ]
    : [];

  return {
    status: 'ready',
    issues: [],
    project: {
      composition,
      durationMs,
      zoomElements: zoom as ZoomElement[],
      editorData: {
        sessionId,
        manifest: manifest as unknown as SessionManifestData,
        videoSrc: videoPath,
        tracks,
        cursor: {
          available: true,
          events: cursor as CursorEvent[],
          telemetry: telemetry.samples as CursorTelemetryPoint[],
          shapes: {},
          catalog: catalogFor(shapes),
          missing: [],
        },
        interactions: { version: 1, events: [] },
        recordedPlatform: ['windows', 'macos', 'linux'].includes(
          String((manifest.platform as JsonRecord | undefined)?.os),
        )
          ? ((manifest.platform as JsonRecord).os as 'windows' | 'macos' | 'linux')
          : null,
        zoom: { elements: zoom as ZoomElement[], generatedSessions: [] },
      },
    },
  };
}
