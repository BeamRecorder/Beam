import { nextTick, ref } from 'vue';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_OUTPUT_CANVAS } from '../../canvas/output-canvas';
import { emptyComposition } from '../../composition/composition-types';
import {
  createDefaultCursorClickEffects,
  createDefaultCursorMotionSettings,
} from '../../../../api/types/cursor-settings';
import type { CaptureProject, ProjectEditorState } from '../../../../api/types/capture-api';
import type { BackgroundMedia, BackgroundValue } from '../backgroundCatalog';
import type { ZoomElement } from '../../zoom/zoom-types';
import {
  beginPropertyInteraction,
  endPropertyInteraction,
  resetPropertyInteractions,
} from '../../../../composables/property-interaction';

const mocks = vi.hoisted(() => ({
  saveProjectEditorState: vi.fn(),
  getProjectEditorState: vi.fn(),
}));
vi.mock('../../../../api/capture', () => ({ capture: mocks }));

import { useProjectEditorState } from '../../composables/useProjectEditorState';

const createState = () => {
  return {
    project: ref<CaptureProject | null | undefined>({
      id: 'project',
      name: 'Project',
      createdAt: '',
      updatedAt: '',
      sessionCount: 0,
      previewSrc: null,
    }),
    composition: ref(emptyComposition()),
    zoomElements: ref<ZoomElement[]>([]),
    generatedSessions: ref<ProjectEditorState['zoom']['generatedSessions']>([]),
    importedBackgrounds: ref<BackgroundMedia[]>([]),
    selectedBackground: ref<BackgroundValue | null>(null),
    backgroundBlurPercent: ref(0),
    canvas: ref({ ...DEFAULT_OUTPUT_CANVAS }),
    cursorEffects: ref(createDefaultCursorClickEffects()),
    cursorMotion: ref(createDefaultCursorMotionSettings()),
    availableBackgrounds: ref<Array<{ items: BackgroundMedia[] }>>([]),
  };
};

describe('useProjectEditorState property persistence', () => {
  afterEach(() => {
    resetPropertyInteractions();
    vi.useRealTimers();
    mocks.saveProjectEditorState.mockReset();
    mocks.getProjectEditorState.mockReset();
  });

  it('waits for a property interaction to end before saving', async () => {
    vi.useFakeTimers();
    const state = createState();
    const editor = useProjectEditorState(state);

    beginPropertyInteraction();
    state.cursorEffects.value.left.springIntensity = 80;
    await nextTick();
    await vi.advanceTimersByTimeAsync(500);
    expect(mocks.saveProjectEditorState).not.toHaveBeenCalled();

    endPropertyInteraction();
    await nextTick();
    await vi.advanceTimersByTimeAsync(250);
    expect(mocks.saveProjectEditorState).toHaveBeenCalledOnce();
    expect(mocks.saveProjectEditorState.mock.calls[0][1].presentation.cursorEffects.left.springIntensity).toBe(80);
    expect(editor.isSaving.value).toBe(false);
  });

  it('loads and normalizes persisted composition, backgrounds, blur and cursor effects', async () => {
    const state = createState();
    const globalBackground: BackgroundMedia = {
      id: 'global',
      name: 'Global',
      path: '/global.png',
      extension: 'png',
      kind: 'image',
    };
    const loadedComposition = {
      ...emptyComposition(),
      clips: [{ id: 'clip', kind: 'caption', name: 'Caption' } as never],
    };
    mocks.getProjectEditorState.mockResolvedValue({
      schemaVersion: 2,
      composition: loadedComposition,
      zoom: {
        elements: [
          {
            id: 'zoom',
            sessionId: 'session',
            startMs: 0,
            endMs: 500,
            focus: { cx: 0.5, cy: 0.5 },
            depth: 2,
            mode: 'manual',
          },
        ],
        generatedSessions: [{ sessionId: 'session', algorithmVersion: 1, generatedAt: 'now' }],
      },
      presentation: {
        canvas: { ...DEFAULT_OUTPUT_CANVAS, width: 1280 },
        selectedBackgroundId: 'global',
        background: null,
        blurPercent: 250,
        importedBackgrounds: [globalBackground],
        cursorEffects: createDefaultCursorClickEffects(),
        cursorMotion: {
          preset: 'custom',
          smoothing: 0.5,
          springMassMultiplier: 1.1,
          motionBlur: 0.2,
        },
      },
    } satisfies ProjectEditorState);
    state.availableBackgrounds.value = [{ items: [globalBackground] }];
    const editor = useProjectEditorState(state);

    await editor.load('project');
    expect(state.composition.value).toEqual(loadedComposition);
    expect(state.zoomElements.value).toHaveLength(1);
    expect(state.generatedSessions.value).toHaveLength(1);
    expect(state.importedBackgrounds.value).toEqual([globalBackground]);
    expect(state.selectedBackground.value).toEqual(globalBackground);
    expect(state.backgroundBlurPercent.value).toBe(100);
    expect(state.canvas.value.width).toBe(1280);
    expect(state.cursorMotion.value).toEqual({
      preset: 'custom',
      smoothing: 0.5,
      springMassMultiplier: 1.1,
      motionBlur: 0.2,
    });
    expect(editor.loading.value).toBe(false);
  });

  it('saves snapshots, preserves custom backgrounds and recovers the write chain after failure', async () => {
    const state = createState();
    const custom: BackgroundValue = {
      id: 'color:#abcdef',
      name: '#ABCDEF',
      kind: 'color',
      color: '#ABCDEF',
    };
    state.selectedBackground.value = custom;
    mocks.saveProjectEditorState.mockRejectedValueOnce(new Error('disk full')).mockResolvedValue(undefined);
    const editor = useProjectEditorState(state);

    await expect(editor.saveNow()).rejects.toThrow('disk full');
    expect(mocks.saveProjectEditorState.mock.calls[0][1].presentation.background).toEqual(custom);
    await editor.saveNow();
    expect(mocks.saveProjectEditorState).toHaveBeenCalledTimes(2);
    expect(editor.isSaving.value).toBe(false);
  });

  it('resolves a late global background and reports unserializable editor state', async () => {
    const state = createState();
    state.project.value = undefined;
    const editorWithoutProject = useProjectEditorState(state);
    await editorWithoutProject.saveNow();
    expect(mocks.saveProjectEditorState).not.toHaveBeenCalled();

    state.project.value = {
      id: 'project',
      name: 'Project',
      createdAt: '',
      updatedAt: '',
      sessionCount: 0,
      previewSrc: null,
    };
    const lateState = useProjectEditorState(state);
    mocks.getProjectEditorState.mockResolvedValue({
      schemaVersion: 2,
      composition: emptyComposition(),
      zoom: { elements: [], generatedSessions: [] },
      presentation: {
        canvas: { ...DEFAULT_OUTPUT_CANVAS },
        selectedBackgroundId: 'late',
        background: null,
        blurPercent: 0,
        importedBackgrounds: [],
        cursorEffects: createDefaultCursorClickEffects(),
      },
    } satisfies ProjectEditorState);
    await lateState.load('project');
    expect(state.selectedBackground.value).toBeNull();
    const lateBackground: BackgroundMedia = {
      id: 'late',
      name: 'Late',
      path: '/late.jpg',
      extension: 'jpg',
      kind: 'image',
    };
    state.availableBackgrounds.value = [{ items: [lateBackground] }];
    await nextTick();
    expect(state.selectedBackground.value).toEqual(lateBackground);

    const cyclic = {} as { self?: unknown };
    cyclic.self = cyclic;
    state.composition.value = cyclic as never;
    await expect(lateState.saveNow()).rejects.toThrow('Impossible de sérialiser');
  });
});
