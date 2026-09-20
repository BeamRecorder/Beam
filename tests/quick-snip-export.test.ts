import { beforeEach, describe, expect, it, vi } from 'vitest';
const captureMock = vi.hoisted(() => ({
  listBackgroundLibrary: vi.fn(async () => []),
  listCursorPacks: vi.fn(async () => []),
  saveQuickSnipRenderState: vi.fn(async () => undefined),
  reportQuickSnipRender: vi.fn(async () => undefined),
}));
const exporterMock = vi.hoisted(() => ({
  exportWithMediabunny: vi.fn(
    async (_request: unknown, _onProgress: (progress: unknown) => void, _signal: AbortSignal) => ({
      path: '/tmp/quick-snip.webm',
      format: 'webm' as const,
      diagnostics: {} as never,
    }),
  ),
}));
vi.mock('~/api/capture', () => ({ capture: captureMock }));
vi.mock('../src/components/export/mediabunny/exporter', () => exporterMock);
import { quickSnipExportRequest, renderQuickSnip } from '../src/components/quick-snip/quick-snip-export';
import type { QuickSnipRenderTask } from '~/api/types/quick-snip';
import type { ProjectEditorData, SessionTrackData } from '~/api/types/capture-api';
import { emptyComposition } from '~/media/shared/composition-types';
import { DEFAULT_OUTPUT_CANVAS } from '../src/components/video-editor/canvas/output-canvas';
import {
  createDefaultCursorMotionSettings,
  createDefaultCursorAutoHideSettings,
  createDefaultCursorClickEffects,
} from '~/api/types/cursor-settings';
const task = (): QuickSnipRenderTask => {
  const tracks: SessionTrackData[] = (['screen', 'microphone'] as const).map((kind) => ({
    trackId: kind,
    kind,
    sourceId: kind,
    format: { width: 1600, height: 900, fps: 30 },
    segments: [],
    assets: [
      {
        path: `${kind}.mp4`,
        src: `project-media://asset/${kind}.mp4`,
        startNs: 0,
        endNs: 2_000_000_000,
        complete: true,
        exists: true,
      },
    ],
    status: 'completed',
    metrics: {},
    terminationReason: null,
  }));
  const editorData: ProjectEditorData = {
    sessionId: 'session',
    videoSrc: tracks[0].assets[0].src,
    videoSessionPath: tracks[0].assets[0].path,
    manifest: {
      schemaVersion: 3,
      projectId: 'project',
      sessionId: 'session',
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
    cursor: { available: false, events: [], telemetry: [], shapes: {}, catalog: {}, missing: [] },
    recordedPlatform: 'windows',
    zoom: { elements: [], generatedSessions: [] },
  };
  return {
    id: 'job',
    configuration: {
      mode: 'studio',
      format: 'webm',
      name: 'Snip',
      automaticZoom: false,
      screenKind: 'display',
      region: { x: 0, y: 0, width: 1, height: 1 },
      regionBounds: { x: 0, y: 0, width: 1600, height: 900 },
      displayId: '1',
      devices: {},
      preset: {
        id: 'default',
        name: 'Default',
        protected: true,
        updatedAt: '',
        settings: {
          editor: { schemaVersion: 1 },
          devices: {},
          export: { format: 'webm', preset: 'high', frameRate: 60, resolution: '720p', includeAudio: true },
          quickSnip: { automaticZoom: false },
        },
      },
    },
    editorData,
    editorState: {
      schemaVersion: 3,
      composition: emptyComposition(),
      zoom: { elements: [], generatedSessions: [] },
      presentation: {
        canvas: { ...DEFAULT_OUTPUT_CANVAS },
        selectedBackgroundId: null,
        importedBackgrounds: [],
        cursor: {
          selection: { packId: 'builtin:macos', mode: 'automatic', cursorId: null },
          size: 45,
          color: '#000000',
          shadow: { enabled: false, blur: 0, color: '#000000', direction: 'bottom' },
          motion: createDefaultCursorMotionSettings(),
          autoHide: createDefaultCursorAutoHideSettings(),
          clickEffects: createDefaultCursorClickEffects(),
        },
      },
    },
  };
};
const invalidTasks = (): Array<[string, () => QuickSnipRenderTask]> => [
  [
    'failed screen track',
    () => {
      const input = task();
      const screen = input.editorData.tracks.find((track) => track.kind === 'screen');
      if (!screen) throw new Error('screen fixture missing');
      screen.status = 'failed';
      input.editorData.manifest.tracks = input.editorData.tracks;
      return input;
    },
  ],
  ['screen segment marked incomplete', () => unusableScreenAsset({ complete: false })],
  ['screen segment whose file is missing', () => unusableScreenAsset({ exists: false })],
  ['screen segment without a media URL', () => unusableScreenAsset({ src: null })],
  [
    'screen track without a usable video source',
    () => {
      const input = task();
      const screen = input.editorData.tracks.find((track) => track.kind === 'screen');
      if (!screen) throw new Error('screen fixture missing');
      input.editorData.videoSrc = null;
      screen.assets = [];
      input.editorData.manifest.tracks = input.editorData.tracks;
      return input;
    },
  ],
  [
    'missing screen track',
    () => {
      const input = task();
      input.editorData.videoSrc = null;
      input.editorData.tracks = input.editorData.tracks.filter((track) => track.kind !== 'screen');
      input.editorData.manifest.tracks = input.editorData.tracks;
      return input;
    },
  ],
  [
    'composition with no active screen clip',
    () => {
      const input = task();
      const validComposition = quickSnipExportRequest(input, [], []).state.composition;
      const screen = validComposition.clips.find((clip) => clip.kind === 'screen');
      if (!screen) throw new Error('screen clip fixture missing');
      screen.enabled = false;
      input.editorState.composition = validComposition;
      return input;
    },
  ],
  [
    'screen clip with no positive timeline duration',
    () => {
      const input = task();
      const validComposition = quickSnipExportRequest(input, [], []).state.composition;
      const screen = validComposition.clips.find((clip) => clip.kind === 'screen');
      if (!screen) throw new Error('screen clip fixture missing');
      screen.timelineDurationMs = 0;
      input.editorState.composition = validComposition;
      return input;
    },
  ],
];
const unusableScreenAsset = (patch: Partial<QuickSnipRenderTask['editorData']['tracks'][number]['assets'][number]>) => {
  const input = task();
  const screen = input.editorData.tracks.find((track) => track.kind === 'screen');
  if (!screen) throw new Error('screen fixture missing');
  input.editorData.videoSrc = null;
  screen.assets = screen.assets.map((asset) => ({ ...asset, ...patch }));
  input.editorData.manifest.tracks = input.editorData.tracks;
  return input;
};
describe('Quick Snip composition export', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('builds video and microphone clips and honors format, quality, fps and resolution', () => {
    const { request } = quickSnipExportRequest(task(), [], []);
    expect(request.format).toBe('webm');
    expect(request.preset).toBe('high');
    expect(request.preview).toBe(true);
    expect(request.snapshot.duration).toBe(2);
    expect(request.snapshot.render.fps).toBe(60);
    expect(request.snapshot.canvas.width).toBe(1280);
    expect(request.snapshot.canvas.height).toBe(720);
    expect(request.snapshot.composition.clips.some((clip) => clip.kind === 'audio')).toBe(true);
    expect(request.snapshot.composition.clips.some((clip) => clip.kind === 'screen')).toBe(true);
    expect(request.snapshot.cursorPack?.id).toBe('builtin:macos');
  });
  it('applies a named preset background and preserves the input state', () => {
    const input = task();
    input.configuration.preset.settings.editor.presentation = {
      ...input.editorState.presentation,
      canvas: { ...DEFAULT_OUTPUT_CANVAS, showBackground: true },
      background: { id: 'color', name: 'Blue', kind: 'color', color: '#123456' },
    };
    const before = structuredClone(input);
    const { request } = quickSnipExportRequest(input, [], []);
    expect(request.snapshot.background).toEqual({ kind: 'color', color: '#123456' });
    expect(input).toEqual(before);
  });
  it.each([
    {
      mode: 'studio' as const,
      format: 'mp4' as const,
      preset: 'low' as const,
      frameRate: 24,
      resolution: '1080p',
      includeAudio: false,
      width: 1920,
      height: 1080,
    },
    {
      mode: 'instant' as const,
      format: 'webm' as const,
      preset: 'high' as const,
      frameRate: 60,
      resolution: '720p',
      includeAudio: true,
      width: 1280,
      height: 720,
    },
  ])('applies every video preset export setting to $mode captures', (videoPreset) => {
    const input = task();
    input.configuration.mode = videoPreset.mode;
    input.configuration.format = videoPreset.format;
    input.configuration.preset.settings.export = {
      format: videoPreset.format,
      preset: videoPreset.preset,
      frameRate: videoPreset.frameRate,
      resolution: videoPreset.resolution,
      includeAudio: videoPreset.includeAudio,
    };

    const { request } = quickSnipExportRequest(input, [], []);

    expect(request.format).toBe(videoPreset.format);
    expect(request.preset).toBe(videoPreset.preset);
    expect(request.includeAudio).toBe(videoPreset.includeAudio);
    expect(request.snapshot.render.fps).toBe(videoPreset.frameRate);
    expect(request.snapshot.canvas).toEqual(
      expect.objectContaining({
        width: videoPreset.width,
        height: videoPreset.height,
      }),
    );
    expect(request.snapshot.composition.clips.some((clip) => clip.kind === 'screen')).toBe(true);
  });

  it('preserves the native screen-track failure reason', () => {
    const input = task();
    const screen = input.editorData.tracks.find((track) => track.kind === 'screen');
    if (!screen) throw new Error('screen fixture missing');
    screen.status = 'failed';
    screen.terminationReason = 'the active FFmpeg segment received no format';

    expect(() => quickSnipExportRequest(input, [], [])).toThrow(
      'Quick Snip video capture failed: the active FFmpeg segment received no format',
    );
  });

  it('generates cursor zooms for a studio export when automatic zoom is enabled', () => {
    const input = task();
    input.configuration.automaticZoom = true;
    input.editorData.cursor.available = true;
    input.editorData.cursor.telemetry = [{ timeMs: 1_000, cx: 0.35, cy: 0.45, interactionType: 'click' }];

    const { state, request } = quickSnipExportRequest(input, [], []);

    expect(state.zoom.elements).toHaveLength(1);
    expect(state.zoom.elements[0]).toEqual(expect.objectContaining({ sessionId: 'session', enabled: true }));
    expect(request.snapshot.zooms).toEqual(state.zoom.elements);
  });

  it('disables automatic zoom while preserving preset canvas, cursor effects and clip appearance', () => {
    const input = task();
    input.configuration.automaticZoom = true;
    input.editorData.cursor.available = true;
    input.editorData.cursor.telemetry = [{ timeMs: 1_000, cx: 0.35, cy: 0.45, interactionType: 'click' }];
    const withZoom = quickSnipExportRequest(input, [], []);
    input.configuration.automaticZoom = false;
    const withoutZoom = quickSnipExportRequest(input, [], []);
    expect(withZoom.state.zoom.elements).toHaveLength(1);
    expect(withoutZoom.state.zoom.elements).toHaveLength(1);
    expect(withoutZoom.state.zoom.elements.every((zoom) => !zoom.enabled)).toBe(true);
    expect(withoutZoom.state.presentation).toEqual(withZoom.state.presentation);
    expect(withoutZoom.state.composition).toEqual(withZoom.state.composition);
    expect(withoutZoom.request.snapshot.canvas).toEqual(withZoom.request.snapshot.canvas);
    expect(withoutZoom.request.format).toBe('webm');
    expect(withoutZoom.request.preset).toBe('high');
  });

  it('uses safe frame and canvas defaults when source and preset values are unsupported', () => {
    const input = task();
    input.editorData.tracks[0].format = {};
    input.configuration.preset.settings.export.frameRate = 48;
    input.configuration.preset.settings.export.resolution = 'original';
    input.configuration.preset.settings.export.preset = 'medium';

    const { request } = quickSnipExportRequest(input, [], []);

    expect(request.snapshot.render.fps).toBe(30);
    expect(request.snapshot.canvas).toEqual(expect.objectContaining({ width: 1920, height: 1080 }));
    expect(request.preset).toBe('medium');
  });

  it.each(invalidTasks())(
    'rejects a Quick Snip with a %s before producing a background-only export',
    (_, createTask) => {
      expect(() => quickSnipExportRequest(createTask(), [], [])).toThrow(/screen|video|capture|écran|vidéo/i);
    },
  );

  it.each(invalidTasks())('does not save render state or invoke the exporter for a %s', async (_, createTask) => {
    await expect(renderQuickSnip(createTask(), new AbortController().signal)).rejects.toThrow(
      /screen|video|capture|écran|vidéo/i,
    );
    expect(captureMock.saveQuickSnipRenderState).not.toHaveBeenCalled();
    expect(exporterMock.exportWithMediabunny).not.toHaveBeenCalled();
  });

  it('saves render state, reports progress and completion, and tolerates a failed progress report', async () => {
    const progress = {
      stage: 'encoding',
      overallProgress: 0.65,
      completedImages: 13,
      totalImages: 20,
      audioProgress: null,
      currentTimeMs: 1_300,
      totalTimeMs: 2_000,
      preview: 'data:image/jpeg;base64,AA==',
    };
    exporterMock.exportWithMediabunny.mockImplementationOnce(async (_request, onProgress) => {
      onProgress(progress);
      return { path: '/tmp/quick-snip.webm', format: 'webm', diagnostics: {} as never };
    });
    captureMock.reportQuickSnipRender.mockRejectedValueOnce(new Error('status window closed'));

    await expect(renderQuickSnip(task(), new AbortController().signal)).resolves.toBeUndefined();

    expect(captureMock.saveQuickSnipRenderState).toHaveBeenCalledOnce();
    expect(exporterMock.exportWithMediabunny).toHaveBeenCalledOnce();
    expect(captureMock.reportQuickSnipRender).toHaveBeenNthCalledWith(1, {
      id: 'job',
      type: 'progress',
      progress: 0.65,
      preview: 'data:image/jpeg;base64,AA==',
    });
    expect(captureMock.reportQuickSnipRender).toHaveBeenNthCalledWith(2, {
      id: 'job',
      type: 'completed',
      path: '/tmp/quick-snip.webm',
    });
  });

  it('stops after loading the libraries when its signal is already aborted', async () => {
    const controller = new AbortController();
    controller.abort();

    await expect(renderQuickSnip(task(), controller.signal)).resolves.toBeUndefined();

    expect(captureMock.listBackgroundLibrary).toHaveBeenCalledOnce();
    expect(captureMock.listCursorPacks).toHaveBeenCalledOnce();
    expect(captureMock.saveQuickSnipRenderState).not.toHaveBeenCalled();
    expect(exporterMock.exportWithMediabunny).not.toHaveBeenCalled();
    expect(captureMock.reportQuickSnipRender).not.toHaveBeenCalled();
  });
});
