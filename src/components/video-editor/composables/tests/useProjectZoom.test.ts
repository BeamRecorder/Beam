import { ref } from 'vue';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ProjectEditorData } from '../../../../api/types/capture-api';
import type { ZoomElement } from '../../zoom/zoom-types';
import { ZOOM_ALGORITHM_VERSION } from '../../zoom/zoom-suggestions';
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

const create = (initialData: ProjectEditorData | null = data(), duration = 5_000) => {
  const activeTab = ref('canvas');
  const editorData = ref(initialData);
  const durationMs = ref(duration);
  return {
    state: useProjectZoom({ editorData, durationMs, activeTab }),
    durationMs,
    activeTab,
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
    expect(state.zoomElements.value).toEqual([
      expect.objectContaining({
        id: '00000000-0000-4000-8000-000000000001',
        sessionId: 'manual',
        startMs: 0,
        endMs: 1_000,
        mode: 'manual',
      }),
    ]);
    expect(state.selectedZoomId.value).toBe('00000000-0000-4000-8000-000000000001');
    expect(activeTab.value).toBe('zoom');
    state.addZoomAtTime(Number.NaN);
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
