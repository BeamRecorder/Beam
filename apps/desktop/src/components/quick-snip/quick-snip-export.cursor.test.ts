import { beforeEach, expect, it, vi } from 'vitest';
import type { QuickSnipRenderTask } from '~/api/types/quick-snip';
import type { ProjectEditorState, SessionTrackData } from '~/api/types/capture-api';
import { createDefaultCursorPresentation } from '@beam/engine/capture/cursor-presentation';
import { emptyComposition } from '@beam/engine/shared/composition-types';
import { DEFAULT_OUTPUT_CANVAS } from '@beam/engine/layout/output-canvas';
import { quickSnipExportRequest, renderQuickSnip } from './quick-snip-export';

const bridge = vi.hoisted(() => ({
  platform: 'darwin',
  listBackgroundLibrary: vi.fn(),
  listCursorPacks: vi.fn(),
  getPreferences: vi.fn(),
  saveQuickSnipRenderState: vi.fn(),
  reportQuickSnipRender: vi.fn(),
}));
const exporter = vi.hoisted(() => vi.fn());
vi.mock('../export/mediabunny/exporter', () => ({ exportWithMediabunny: exporter }));
vi.mock('~/api/capture', () => ({ capture: bridge }));
beforeEach(() => {
  vi.resetAllMocks();
  bridge.platform = 'darwin';
  bridge.listBackgroundLibrary.mockResolvedValue([]);
  bridge.listCursorPacks.mockResolvedValue([]);
  bridge.getPreferences.mockResolvedValue({ extras: { videoExportBackend: 'ffmpeg-vaapi' } });
  bridge.saveQuickSnipRenderState.mockResolvedValue(undefined);
  bridge.reportQuickSnipRender.mockResolvedValue(undefined);
  exporter.mockResolvedValue({ path: '/output.mp4' });
});

function task(cursorVisible?: boolean, cursorEmbedded = false): QuickSnipRenderTask {
  const segment = {
    path: 'screen/segment.mp4',
    startNs: 0,
    endNs: 10_000_000_000,
    complete: true,
    src: '/screen.mp4',
    exists: true,
  };
  const track: SessionTrackData = {
    trackId: 'screen',
    kind: 'screen',
    sourceId: 'sck:display:3',
    format: { width: 1920, height: 1080, fps: 30 },
    segments: [segment],
    assets: [segment],
    metrics: {},
    status: 'completed',
    terminationReason: null,
  };
  const state: ProjectEditorState = {
    schemaVersion: 3,
    isFresh: true,
    composition: emptyComposition(),
    zoom: { elements: [], generatedSessions: [] },
    presentation: {
      canvas: { ...DEFAULT_OUTPUT_CANVAS, showBackground: false },
      selectedBackgroundId: null,
      background: null,
      blurPercent: 0,
      importedBackgrounds: [],
      cursor: createDefaultCursorPresentation(),
    },
  };
  return {
    id: 'task',
    editorState: state,
    configuration: {
      mode: 'instant',
      format: 'mp4',
      name: 'Recording',
      automaticZoom: true,
      screenKind: 'display',
      region: null,
      regionBounds: { x: 0, y: 0, width: 1920, height: 1080 },
      displayId: '3',
      showRealCursor: false,
      devices: {},
      preset: {
        id: 'cursor-on',
        name: 'Cursor on',
        protected: false,
        updatedAt: '',
        settings: {
          editor: { schemaVersion: 1, presentation: structuredClone(state.presentation) },
          devices: {},
          export: { frameRate: 30, preset: 'medium' },
          quickSnip: { automaticZoom: true },
        },
      },
    },
    editorData: {
      sessionId: 'session',
      videoSrc: '/screen.mp4',
      videoSessionPath: segment.path,
      tracks: [track],
      recordedPlatform: 'macos',
      interactions: { version: 1, events: [] },
      zoom: { elements: [], generatedSessions: [] },
      manifest: {
        schemaVersion: 2,
        projectId: 'project',
        sessionId: 'session',
        createdAtUtc: '',
        sessionStartMonotonicNs: 0,
        durationNs: 10_000_000_000,
        platform: { os: 'macos' },
        selectedSources: {},
        tracks: [track],
        permissions: {},
        warnings: [],
        completed: true,
        cursorEmbedded,
        ...(cursorVisible === undefined ? {} : { cursorVisible }),
      },
      cursor: {
        available: true,
        events: [],
        shapes: {},
        catalog: {},
        missing: [],
        telemetry: [{ timeMs: 2000, cx: 0.23, cy: 0.77, visible: true, interactionType: 'click' }],
      },
    },
  };
}

it('keeps Show cursor OFF after applying an enabled preset without disabling automatic zooms', () => {
  const input = task(false);
  const result = quickSnipExportRequest(input, [], []);
  expect(result.state.presentation.cursor.enabled).toBe(false);
  expect(result.request.snapshot.cursorSettings.enabled).toBe(false);
  expect(result.state.zoom.elements).toHaveLength(1);
  expect(result.state.zoom.elements[0]?.focus).toEqual({ cx: 0.23, cy: 0.77 });
  expect(result.request.snapshot.cursor.telemetry).toEqual(input.editorData.cursor.telemetry);
  expect(input.configuration.preset.settings.editor.presentation?.cursor.enabled).toBe(true);
  expect(input.editorState.presentation.cursor.enabled).toBe(true);
});

it.each([true, undefined])(
  'retains cursor defaults when recording visibility is %s without an embedded cursor',
  (visible) => {
    expect(quickSnipExportRequest(task(visible), [], []).state.presentation.cursor.enabled).toBe(true);
  },
);

it('keeps the Beam overlay off when the real cursor is already embedded', () => {
  expect(quickSnipExportRequest(task(true, true), [], []).state.presentation.cursor.enabled).toBe(false);
});

it('does not carry an OFF recording choice into the next export using the same preset', () => {
  const input = task(false);
  expect(quickSnipExportRequest(input, [], []).state.presentation.cursor.enabled).toBe(false);
  input.editorData.manifest.cursorVisible = undefined;
  expect(quickSnipExportRequest(input, [], []).state.presentation.cursor.enabled).toBe(true);
});

it.each(['darwin', 'linux'])('saves and exports the hidden cursor with automatic zooms on %s', async (platform) => {
  bridge.platform = platform;
  bridge.reportQuickSnipRender.mockRejectedValueOnce(new Error('progress report unavailable'));
  exporter.mockImplementationOnce(async (_request, progress) => {
    progress({
      stage: 'encoding',
      overallProgress: 0.5,
      completedImages: 1,
      totalImages: 2,
      audioProgress: null,
      currentTimeMs: 5000,
      totalTimeMs: 10000,
    });
    return { path: '/output.mp4' };
  });
  await renderQuickSnip(task(false), new AbortController().signal);
  const saved = bridge.saveQuickSnipRenderState.mock.calls[0]![1] as ProjectEditorState;
  expect(saved.presentation.cursor.enabled).toBe(false);
  expect(saved.zoom.elements).toHaveLength(1);
  expect(exporter.mock.calls[0]![0].snapshot.cursorSettings.enabled).toBe(false);
  expect(exporter.mock.calls[0]![0].experimentalLinuxFfmpeg).toBe(platform === 'linux' ? true : undefined);
  expect(bridge.reportQuickSnipRender).toHaveBeenCalledWith({
    id: 'task',
    type: 'progress',
    progress: 0.5,
    preview: undefined,
  });
  expect(bridge.reportQuickSnipRender).toHaveBeenCalledWith({ id: 'task', type: 'completed', path: '/output.mp4' });
});

it.each(['before-save', 'after-save'])('does not publish an export cancelled %s', async (when) => {
  const controller = new AbortController();
  if (when === 'before-save') controller.abort();
  else bridge.saveQuickSnipRenderState.mockImplementationOnce(async () => controller.abort());
  await renderQuickSnip(task(false), controller.signal);
  expect(exporter).not.toHaveBeenCalled();
  expect(bridge.reportQuickSnipRender).not.toHaveBeenCalled();
});

it('does not report completion when encoding fails', async () => {
  exporter.mockRejectedValueOnce(new Error('encoder failed'));
  await expect(renderQuickSnip(task(false), new AbortController().signal)).rejects.toThrow('encoder failed');
  expect(bridge.reportQuickSnipRender).not.toHaveBeenCalled();
});

it.each(['missing', 'failed', 'incomplete'])(
  'rejects %s recorded video instead of exporting an empty result',
  (kind) => {
    const input = task(false);
    if (kind === 'missing') input.editorData.tracks = [];
    else if (kind === 'failed') input.editorData.tracks[0]!.status = 'failed';
    else input.editorData.tracks[0]!.assets[0]!.complete = false;
    expect(() => quickSnipExportRequest(input, [], [])).toThrow('no usable video');
  },
);

it('retains the specific capture failure and rejects disabled screen clips', () => {
  const input = task(false);
  input.editorData.tracks[0]!.status = 'failed';
  input.editorData.tracks[0]!.terminationReason = 'screen permission lost';
  expect(() => quickSnipExportRequest(input, [], [])).toThrow('screen permission lost');
  const disabled = task(false);
  disabled.editorState = quickSnipExportRequest(disabled, [], []).state;
  disabled.editorState.composition.clips[0]!.enabled = false;
  expect(() => quickSnipExportRequest(disabled, [], [])).toThrow('no active screen video');
});

it.each(['720p', '1080p', 'original'])(
  'retains the OFF choice when exporting %s with source frame rate',
  (resolution) => {
    const input = task(false);
    input.configuration.preset.settings.export = { frameRate: 120, resolution, preset: 'high', includeAudio: false };
    const result = quickSnipExportRequest(input, [], []);
    expect(result.request.snapshot.cursorSettings.enabled).toBe(false);
    expect(result.request.snapshot.render.fps).toBe(30);
    expect(result.request.includeAudio).toBe(false);
    expect(result.request.preset).toBe('high');
  },
);

it('keeps automatic lenses available while the cursor is hidden', () => {
  const input = task(false);
  input.configuration.zoomMode = 'glass';
  const result = quickSnipExportRequest(input, [], []);
  expect(result.state.presentation.cursor.enabled).toBe(false);
  expect(result.state.zoom.elements[0]?.effect).toBe('glass');
});

it('does not invent zooms when cursor data is unavailable', () => {
  const input = task(false);
  input.editorData.cursor.available = false;
  expect(quickSnipExportRequest(input, [], []).state.zoom.elements).toEqual([]);
});

it('retains the explicit automatic-zoom OFF choice independently of cursor visibility', () => {
  const input = task(false);
  input.configuration.automaticZoom = false;
  expect(quickSnipExportRequest(input, [], []).state.zoom.elements.every((zoom) => zoom.enabled === false)).toBe(true);
});
