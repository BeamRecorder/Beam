import { ref } from 'vue';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ProjectEditorData } from '../../../../api/types/capture-api';
import type { ZoomElement } from '../../zoom/zoom-types';
import { ZOOM_ALGORITHM_VERSION } from '../../zoom/zoom-suggestions';
import type { EditorPreferenceDefaults } from '../editor-default-types';
import { normalizeEditorPreferenceDefaults } from '../editor-defaults';
import { useProjectZoom } from '../useProjectZoom';

const zoom = (id: string, mode: ZoomElement['mode'] = 'manual', sessionId = 'session'): ZoomElement => ({
  id,
  sessionId,
  startMs: 1_000,
  endMs: 2_000,
  depth: 2,
  mode,
  focus: { cx: 0.5, cy: 0.5 },
});

const data = (overrides: Partial<ProjectEditorData> = {}): ProjectEditorData => ({
  sessionId: 'session',
  videoSrc: null,
  tracks: [],
  manifest: {
    schemaVersion: 1,
    projectId: 'project',
    sessionId: 'session',
    createdAtUtc: '',
    sessionStartMonotonicNs: 0,
    durationNs: 10_000_000_000,
    platform: {},
    selectedSources: {},
    tracks: [],
    permissions: {},
    warnings: [],
    completed: true,
  },
  cursor: {
    available: true,
    events: [],
    telemetry: [{ timeMs: 2_000, cx: 0.2, cy: 0.8, interactionType: 'click' }],
    shapes: {},
    catalog: {},
    missing: [],
  },
  recordedPlatform: null,
  zoom: { elements: [], generatedSessions: [] },
  ...overrides,
});

const create = (
  initialData: ProjectEditorData | null = data(),
  duration = 5_000,
  defaults: EditorPreferenceDefaults = normalizeEditorPreferenceDefaults(undefined),
) => {
  const activeTab = ref('canvas');
  const editorData = ref(initialData);
  const durationMs = ref(duration);
  const editorDefaults = ref(defaults);
  return {
    state: useProjectZoom({ editorData, durationMs, activeTab, editorDefaults }),
    durationMs,
    activeTab,
    editorDefaults,
  };
};

beforeEach(() => {
  vi.spyOn(crypto, 'randomUUID').mockReturnValue('00000000-0000-4000-8000-000000000001');
});
afterEach(() => vi.restoreAllMocks());

describe('useProjectZoom', () => {
  it('derives selection and generation capabilities from editor data', () => {
    const { state } = create(null);
    expect(state.canGenerateZooms.value).toBe(false);
    expect(state.selectedZoom.value).toBeNull();
    state.zoomElements.value = [zoom('manual')];
    state.selectedZoomId.value = 'manual';
    expect(state.selectedZoom.value).toMatchObject({ id: 'manual' });
    expect(state.hasAutomaticZooms.value).toBe(false);
  });

  it('adds a bounded manual zoom without a separate persistence side effect', () => {
    const { state, activeTab } = create(null, 1_000);
    state.addZoomAtTime(99_999);
    expect(state.zoomElements.value).toEqual([]);
    state.addZoomAtTime(-99);
    expect(state.zoomElements.value).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: '00000000-0000-4000-8000-000000000001',
          sessionId: 'manual',
          startMs: 0,
          endMs: 1_000,
          mode: 'manual',
        }),
      ]),
    );
    expect(state.zoomElements.value).toHaveLength(1);
    expect(state.selectedZoomId.value).toBe('00000000-0000-4000-8000-000000000001');
    expect(activeTab.value).toBe('zoom');
    state.addZoomAtTime(Number.NaN);
    expect(state.zoomElements.value).toHaveLength(1);
  });

  it('uses zoom defaults for new zooms without changing existing zooms', () => {
    const defaults = normalizeEditorPreferenceDefaults({
      zoom: { durationMs: 1_750, depth: 5, mode: 'auto' },
    });
    const { state } = create(null, 10_000, defaults);
    const existing = zoom('existing');
    const existingSnapshot = { ...existing, focus: { ...existing.focus } };
    state.zoomElements.value = [existing];

    state.addZoomAtTime(3_000);

    expect(state.zoomElements.value).toHaveLength(2);
    expect(state.zoomElements.value[0]).toEqual(existingSnapshot);
    expect(state.zoomElements.value[1]).toMatchObject({
      startMs: 3_000,
      endMs: 4_750,
      depth: 5,
      mode: 'auto',
    });
  });

  it('fits a requested manual zoom into the free gap after an existing eight-second zoom', () => {
    const { state } = create(null, 10_000);
    state.zoomElements.value = [zoom('existing', 'manual')];
    state.zoomElements.value[0] = { ...state.zoomElements.value[0]!, startMs: 0, endMs: 8_000 };

    state.addZoomAtTime({ startMs: 7_500, durationMs: 1_200 });

    expect(state.zoomElements.value).toHaveLength(2);
    expect(state.zoomElements.value[1]).toMatchObject({ startMs: 8_000, endMs: 9_200 });
  });

  it('does not create a zoom when the requested gap is shorter than 200 ms', () => {
    const { state } = create(null, 10_000);
    state.zoomElements.value = [zoom('existing', 'manual')];
    state.zoomElements.value[0] = { ...state.zoomElements.value[0]!, startMs: 100, endMs: 10_000 };

    state.addZoomAtTime(100);

    expect(state.zoomElements.value).toHaveLength(1);
  });

  it('replaces only automatic zooms for the active session', () => {
    const { state } = create(data());
    state.zoomElements.value = [
      { ...zoom('manual'), startMs: 0, endMs: 1_000 },
      zoom('old-auto', 'auto'),
      zoom('other-auto', 'auto', 'other'),
    ];
    state.generatedSessions.value = [
      { sessionId: 'other', algorithmVersion: ZOOM_ALGORITHM_VERSION, generatedAt: 'old' },
    ];
    state.generateZooms();
    expect(state.zoomElements.value).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: 'manual' }),
        expect.objectContaining({ id: 'other-auto' }),
        expect.objectContaining({ id: 'auto:session:2000', mode: 'auto' }),
      ]),
    );
    expect(state.zoomElements.value.find((item) => item.id === 'old-auto')).toBeUndefined();
    expect(state.generatedSessions.value).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ sessionId: 'session', algorithmVersion: ZOOM_ALGORITHM_VERSION }),
        expect.objectContaining({ sessionId: 'other' }),
      ]),
    );
  });

  it('generates an automatic zoom in the free gap after a reserved eight-second zoom', () => {
    const { state } = create(
      data({
        cursor: {
          available: true,
          events: [],
          telemetry: [{ timeMs: 8_100, cx: 0.25, cy: 0.75, interactionType: 'click' }],
          shapes: {},
          catalog: {},
          missing: [],
        },
      }),
      10_000,
    );
    state.zoomElements.value = [{ ...zoom('manual'), startMs: 0, endMs: 8_000 }];

    state.generateZooms();

    expect(state.zoomElements.value).toContainEqual(
      expect.objectContaining({ mode: 'auto', startMs: 8_000, endMs: 9_000 }),
    );
  });

  it('does not generate when cursor data is unavailable', () => {
    const noCursor = data({
      cursor: { available: false, events: [], telemetry: [], shapes: {}, catalog: {}, missing: [] },
    });
    const { state } = create(noCursor);
    state.generateZooms();
    expect(state.zoomElements.value).toEqual([]);
    expect(state.generatedSessions.value).toEqual([]);
  });

  it('does not record a generation at zero duration, then generates once duration is ready', () => {
    const { state, durationMs } = create(data(), 0);

    state.ensureAutomaticZooms();

    expect(state.zoomElements.value).toEqual([]);
    expect(state.generatedSessions.value).toEqual([]);

    durationMs.value = 5_000;
    state.ensureAutomaticZooms();

    expect(state.generatedSessions.value).toEqual([
      expect.objectContaining({ sessionId: 'session', algorithmVersion: ZOOM_ALGORITHM_VERSION }),
    ]);
    expect(state.zoomElements.value).toEqual(
      expect.arrayContaining([expect.objectContaining({ id: 'auto:session:2000', mode: 'auto' })]),
    );
  });

  it('updates, trims, moves and deletes local zoom state', () => {
    const { state } = create();
    state.zoomElements.value = [zoom('one')];
    state.updateZoom({ ...zoom('one'), startMs: -1, endMs: 2 });
    expect(state.zoomElements.value).toEqual([zoom('one')]);
    state.updateZoom({ ...zoom('one'), startMs: 10, endMs: 20, depth: 6 });
    expect(state.zoomElements.value[0]).toMatchObject({ startMs: 10, endMs: 20, depth: 6 });
    state.moveZoom('one', 30, 60);
    expect(state.zoomElements.value[0]).toMatchObject({ startMs: 30, endMs: 60 });
    state.trimZoomEdge('one', 'end', 500);
    expect(state.zoomElements.value[0].endMs).toBe(500);
    state.selectedZoomId.value = 'one';
    state.deleteSelectedZoom();
    expect(state.zoomElements.value).toEqual([]);
    expect(state.selectedZoomId.value).toBeNull();
  });

  it('pastes a zoom at the playhead while preserving its duration and settings', () => {
    const { state } = create(data(), 10_000);
    const copied = {
      ...zoom('copied'),
      startMs: 1_000,
      endMs: 2_750,
      focus: { cx: 0.23, cy: 0.81 },
      depth: 5 as const,
      mode: 'manual' as const,
    };
    vi.mocked(crypto.randomUUID)
      .mockReturnValueOnce('00000000-0000-4000-8000-000000000010')
      .mockReturnValueOnce('00000000-0000-4000-8000-000000000011')
      .mockReturnValueOnce('00000000-0000-4000-8000-000000000012');

    state.zoomElements.value = [copied];
    const pasted = state.pasteZoomAtTime(copied, 4_000);

    expect(pasted).toMatchObject({
      id: '00000000-0000-4000-8000-000000000010',
      startMs: 4_000,
      endMs: 5_750,
      focus: copied.focus,
      depth: copied.depth,
      mode: copied.mode,
      sessionId: copied.sessionId,
    });
    expect(pasted.endMs - pasted.startMs).toBe(copied.endMs - copied.startMs);
    expect(state.zoomElements.value).toContainEqual(copied);
  });

  it('atomically trims, removes, and splits every zoom covered by the pasted interval', () => {
    const { state } = create(data(), 10_000);
    const copied = { ...zoom('copied'), startMs: 0, endMs: 1_000 };
    vi.mocked(crypto.randomUUID)
      .mockReturnValueOnce('00000000-0000-4000-8000-000000000020')
      .mockReturnValueOnce('00000000-0000-4000-8000-000000000021');
    state.zoomElements.value = [
      { ...zoom('left-overlap'), startMs: 500, endMs: 1_500 },
      { ...zoom('fully-covered'), startMs: 1_000, endMs: 2_000 },
      { ...zoom('right-overlap'), startMs: 1_500, endMs: 2_500 },
      { ...zoom('spanning'), startMs: 500, endMs: 2_500 },
    ];

    state.pasteZoomAtTime(copied, 1_000);

    expect(state.zoomElements.value).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: 'left-overlap', startMs: 500, endMs: 1_000 }),
        expect.objectContaining({ id: 'right-overlap', startMs: 2_000, endMs: 2_500 }),
        expect.objectContaining({ id: 'spanning', startMs: 500, endMs: 1_000 }),
        expect.objectContaining({ id: '00000000-0000-4000-8000-000000000021', startMs: 2_000, endMs: 2_500 }),
        expect.objectContaining({ id: '00000000-0000-4000-8000-000000000020', startMs: 1_000, endMs: 2_000 }),
      ]),
    );
    expect(state.zoomElements.value).toHaveLength(5);
    expect(new Set(state.zoomElements.value.map((item) => item.id)).size).toBe(state.zoomElements.value.length);
  });

  it('rejects a paste that would exceed timeline bounds without partially mutating zooms', () => {
    const { state } = create(data(), 5_000);
    const existing = zoom('existing');
    const copied = { ...zoom('copied'), startMs: 0, endMs: 2_000 };
    state.zoomElements.value = [existing];

    expect(() => state.pasteZoomAtTime(copied, 4_001)).toThrow();
    expect(state.zoomElements.value).toEqual([existing]);
  });

  it('skips automatic generation after the current algorithm was recorded', () => {
    const { state } = create();
    state.zoomElements.value = [zoom('saved')];
    state.generatedSessions.value = [
      { sessionId: 'session', algorithmVersion: ZOOM_ALGORITHM_VERSION, generatedAt: 'now' },
    ];
    state.ensureAutomaticZooms();
    expect(state.zoomElements.value).toEqual([zoom('saved')]);
  });
});
