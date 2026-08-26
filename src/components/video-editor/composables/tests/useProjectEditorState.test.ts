import { nextTick, reactive, ref } from 'vue';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_OUTPUT_CANVAS } from '../../canvas/output-canvas';
import { emptyComposition, type Clip, type ColorClip, type VisualClip } from '~/media/shared/composition-types';
import {
  createDefaultCursorClickEffects,
  createDefaultCursorMotionSettings,
} from '../../../../api/types/cursor-settings';
import type { CaptureProject, ProjectEditorState } from '../../../../api/types/capture-api';
import type { CursorSelection } from '../../../../api/types/cursor-pack';
import type { BackgroundMedia, BackgroundValue } from '../backgroundCatalog';
import { DEFAULT_ZOOM_MOTION_BLUR, type ZoomElement } from '../../zoom/zoom-types';
import { createDefaultCursorPresentation } from '../../../../api/types/cursor-presentation';
import type { EditorPreferenceDefaults } from '../editor-default-types';
import { normalizeEditorPreferenceDefaults } from '../editor-defaults';
import { existingZoom, globalCursor, projectCursor } from './useProjectEditorState.test-support';
import {
  beginPropertyInteraction,
  endPropertyInteraction,
  resetPropertyInteractions,
} from '../../../../composables/property-interaction';

const mocks = vi.hoisted(() => ({
  saveProjectEditorState: vi.fn(),
  getProjectEditorState: vi.fn(),
  updatePreferences: vi.fn(),
}));
vi.mock('../../../../api/capture', () => ({ capture: mocks }));

import { useProjectEditorState } from '../../composables/useProjectEditorState';

const createState = () => {
  const cursor = createDefaultCursorPresentation();
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
    zoomMotionBlur: ref({ ...DEFAULT_ZOOM_MOTION_BLUR }),
    importedBackgrounds: ref<BackgroundMedia[]>([]),
    selectedBackground: ref<BackgroundValue | null>(null),
    backgroundBlurPercent: ref(0),
    canvas: ref({ ...DEFAULT_OUTPUT_CANVAS }),
    cursorEffects: ref(createDefaultCursorClickEffects()),
    cursorMotion: ref(createDefaultCursorMotionSettings()),
    cursorAutoHide: ref({ ...cursor.autoHide }),
    cursorSelection: ref<CursorSelection>({ ...cursor.selection }),
    cursorSize: ref(cursor.size),
    cursorColor: ref(cursor.color),
    cursorShadowEnabled: ref(cursor.shadow.enabled),
    cursorShadowBlur: ref(cursor.shadow.blur),
    cursorShadowColor: ref(cursor.shadow.color),
    cursorShadowDirection: ref(cursor.shadow.direction),
    availableBackgrounds: ref<Array<{ items: BackgroundMedia[] }>>([]),
    editorDefaults: ref<EditorPreferenceDefaults>(normalizeEditorPreferenceDefaults(undefined)),
    selectedClip: ref<Clip | null>(null),
    selectedZoom: ref<ZoomElement | null>(null),
  };
};

const preferredBackground: BackgroundMedia = {
  id: 'preferred-background',
  name: 'Preferred background',
  path: '/preferred-background.png',
  extension: 'png',
  kind: 'image',
};

const editorDefaults = () =>
  normalizeEditorPreferenceDefaults({
    presentation: {
      canvas: { ...DEFAULT_OUTPUT_CANVAS, preset: '1:1', width: 1080, height: 1080, showBackground: true },
      selectedBackgroundId: preferredBackground.id,
      background: null,
      blurPercent: 37,
      cursor: globalCursor(),
    },
    zoomMotionBlur: { enabled: false, intensity: 0.82 },
  });

describe('useProjectEditorState property persistence', () => {
  beforeEach(() => {
    mocks.updatePreferences.mockResolvedValue(undefined);
  });

  afterEach(() => {
    resetPropertyInteractions();
    vi.useRealTimers();
    mocks.saveProjectEditorState.mockReset();
    mocks.getProjectEditorState.mockReset();
    mocks.updatePreferences.mockReset();
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
    expect(mocks.saveProjectEditorState.mock.calls[0][1].presentation.cursor.clickEffects.left.springIntensity).toBe(
      80,
    );
    expect(editor.isSaving.value).toBe(false);
  });

  it('loads and normalizes persisted composition, backgrounds, blur and cursor effects', async () => {
    const state = createState();
    state.canvas.value.showBackground = true;
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
      schemaVersion: 3,
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
        canvas: { ...DEFAULT_OUTPUT_CANVAS, width: 1280, showBackground: false },
        selectedBackgroundId: 'global',
        background: null,
        blurPercent: 250,
        importedBackgrounds: [globalBackground],
        cursor: {
          ...createDefaultCursorPresentation(),
          selection: { packId: 'pack-imported', mode: 'fixed', cursorId: 'left_ptr' },
          motion: { preset: 'custom', smoothing: 0.5, springMassMultiplier: 1.1, motionBlur: 0.2 },
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
    expect(state.cursorSelection.value).toEqual({
      packId: 'pack-imported',
      mode: 'fixed',
      cursorId: 'left_ptr',
    });
    expect(state.canvas.value.showBackground).toBe(false);
    expect(state.cursorMotion.value).toEqual({
      preset: 'custom',
      smoothing: 0.5,
      springMassMultiplier: 1.1,
      motionBlur: 0.2,
    });
    expect(state.cursorAutoHide.value).toEqual({ enabled: false, delaySeconds: 2, fadeDurationMs: 250 });
    expect(editor.loading.value).toBe(false);
  });

  it('applies presentation defaults only when the loaded project is fresh', async () => {
    const state = createState();
    const defaults = editorDefaults();
    state.editorDefaults.value = defaults;
    state.availableBackgrounds.value = [{ items: [preferredBackground] }];
    mocks.getProjectEditorState.mockResolvedValue({
      schemaVersion: 3,
      isFresh: true,
      composition: emptyComposition(),
      zoom: { elements: [], generatedSessions: [] },
      presentation: {
        canvas: { ...DEFAULT_OUTPUT_CANVAS, preset: '16:9', width: 1920, height: 1080, showBackground: false },
        selectedBackgroundId: null,
        background: null,
        blurPercent: 0,
        importedBackgrounds: [],
        cursor: createDefaultCursorPresentation(),
      },
    } satisfies ProjectEditorState);

    const editor = useProjectEditorState(state);
    await editor.load('project');

    expect(state.canvas.value).toEqual(defaults.presentation!.canvas);
    expect(state.selectedBackground.value).toEqual(preferredBackground);
    expect(state.backgroundBlurPercent.value).toBe(37);
    expect(state.cursorSize.value).toBe(64);
    expect(state.cursorColor.value).toBe('#123456');
    expect(state.cursorEffects.value).toEqual(defaults.presentation!.cursor.clickEffects);
    expect(state.cursorMotion.value).toEqual(defaults.presentation!.cursor.motion);
    expect(state.cursorAutoHide.value).toEqual(defaults.presentation!.cursor.autoHide);
  });

  it('preserves every saved editor setting for an existing project', async () => {
    const state = createState();
    const defaults = editorDefaults();
    state.editorDefaults.value = defaults;
    const existingPresentation: ProjectEditorState['presentation'] = {
      canvas: { ...DEFAULT_OUTPUT_CANVAS, preset: '9:16', width: 1080, height: 1920, showBackground: false },
      selectedBackgroundId: null,
      background: { id: 'saved-color', name: '#abcdef', kind: 'color', color: '#abcdef' },
      blurPercent: 12,
      importedBackgrounds: [],
      cursor: projectCursor(),
    };
    mocks.getProjectEditorState.mockResolvedValue({
      schemaVersion: 3,
      isFresh: false,
      composition: emptyComposition(),
      zoom: {
        elements: [existingZoom],
        generatedSessions: [],
        motionBlur: { enabled: true, intensity: 0.11 },
      },
      presentation: existingPresentation,
    } satisfies ProjectEditorState);

    const editor = useProjectEditorState(state);
    await editor.load('project');

    expect(state.canvas.value).toEqual(existingPresentation.canvas);
    expect(state.selectedBackground.value).toEqual(existingPresentation.background);
    expect(state.backgroundBlurPercent.value).toBe(existingPresentation.blurPercent);
    expect(state.zoomElements.value).toEqual([existingZoom]);
    expect(state.zoomMotionBlur.value).toEqual({ enabled: true, intensity: 0.11 });
    expect(state.cursorSelection.value).toEqual(existingPresentation.cursor.selection);
    expect(state.cursorSize.value).toBe(existingPresentation.cursor.size);
    expect(state.cursorColor.value).toBe(existingPresentation.cursor.color);
    expect(state.importedBackgrounds.value).toEqual(existingPresentation.importedBackgrounds);
    expect(state.cursorEffects.value).toEqual(existingPresentation.cursor.clickEffects);
    expect(state.cursorMotion.value).toEqual(existingPresentation.cursor.motion);
    expect(state.cursorAutoHide.value).toEqual(existingPresentation.cursor.autoHide);
    expect(state.cursorShadowEnabled.value).toBe(existingPresentation.cursor.shadow.enabled);
    expect(state.cursorShadowBlur.value).toBe(existingPresentation.cursor.shadow.blur);
    expect(state.cursorShadowColor.value).toBe(existingPresentation.cursor.shadow.color);
    expect(state.cursorShadowDirection.value).toBe(existingPresentation.cursor.shadow.direction);
  });

  it('never persists editor defaults through the preferences API', async () => {
    vi.useFakeTimers();
    const state = createState();
    mocks.getProjectEditorState.mockResolvedValue({
      schemaVersion: 3,
      isFresh: false,
      composition: emptyComposition(),
      zoom: { elements: [], generatedSessions: [] },
      presentation: {
        canvas: { ...DEFAULT_OUTPUT_CANVAS },
        selectedBackgroundId: null,
        background: null,
        blurPercent: 0,
        importedBackgrounds: [],
        cursor: createDefaultCursorPresentation(),
      },
    } satisfies ProjectEditorState);
    mocks.saveProjectEditorState.mockResolvedValue(undefined);

    const editor = useProjectEditorState(state);
    await editor.load('project');
    await nextTick();

    editor.scheduleSave(false);
    await vi.advanceTimersByTimeAsync(250);
    await nextTick();
    await Promise.resolve();

    expect(mocks.updatePreferences).not.toHaveBeenCalled();

    editor.enableDefaultCapture();
    editor.scheduleSave();
    await vi.advanceTimersByTimeAsync(250);
    await nextTick();
    await Promise.resolve();

    expect(mocks.updatePreferences).not.toHaveBeenCalled();
    expect(mocks.saveProjectEditorState).toHaveBeenCalledTimes(2);
  });

  it('saves snapshots, preserves custom backgrounds and recovers the write chain after failure', async () => {
    const state = createState();
    state.canvas.value.showBackground = false;
    const custom: BackgroundValue = {
      id: 'color:#abcdef',
      name: '#ABCDEF',
      kind: 'color',
      color: '#ABCDEF',
    };
    state.selectedBackground.value = custom;
    state.cursorSelection.value = { packId: 'pack-imported', mode: 'fixed', cursorId: 'arrow' };
    mocks.saveProjectEditorState.mockRejectedValueOnce(new Error('disk full')).mockResolvedValue(undefined);
    const editor = useProjectEditorState(state);

    await expect(editor.saveNow()).rejects.toThrow('disk full');
    expect(mocks.saveProjectEditorState.mock.calls[0][1].presentation.background).toEqual(custom);
    expect(mocks.saveProjectEditorState.mock.calls[0][1].presentation.cursor.selection).toEqual({
      packId: 'pack-imported',
      mode: 'fixed',
      cursorId: 'arrow',
    });
    expect(mocks.saveProjectEditorState.mock.calls[0][1].presentation.canvas.showBackground).toBe(false);
    expect(mocks.saveProjectEditorState.mock.calls[0][1].schemaVersion).toBe(3);
    await editor.saveNow();
    expect(mocks.saveProjectEditorState).toHaveBeenCalledTimes(2);
    expect(editor.isSaving.value).toBe(false);
  });

  it('keeps editor saves independent from the preferences API', async () => {
    const state = createState();
    mocks.saveProjectEditorState.mockResolvedValue(undefined);
    mocks.updatePreferences.mockRejectedValueOnce(new Error('preferences unavailable'));

    const editor = useProjectEditorState(state);
    await expect(editor.saveNow()).resolves.toBeUndefined();
    expect(mocks.updatePreferences).not.toHaveBeenCalled();
    expect(editor.isSaving.value).toBe(false);
  });

  it('round-trips cursor auto-hide settings through save and load', async () => {
    const savedState = createState();
    savedState.cursorAutoHide.value = { enabled: true, delaySeconds: 7.5, fadeDurationMs: 750 };
    mocks.saveProjectEditorState.mockResolvedValue(undefined);

    const savingEditor = useProjectEditorState(savedState);
    await savingEditor.saveNow();
    const persistedState = mocks.saveProjectEditorState.mock.calls[0][1] as ProjectEditorState;
    expect(persistedState.presentation.cursor.autoHide).toEqual({
      enabled: true,
      delaySeconds: 7.5,
      fadeDurationMs: 750,
    });

    const loadingState = createState();
    mocks.getProjectEditorState.mockResolvedValue(persistedState);
    const loadingEditor = useProjectEditorState(loadingState);
    await loadingEditor.load('project');

    expect(loadingState.cursorAutoHide.value).toEqual({ enabled: true, delaySeconds: 7.5, fadeDurationMs: 750 });
  });

  it('updates in-memory editor defaults alongside the first successful editor save', async () => {
    const state = createState();
    const selectedClip: VisualClip = {
      id: 'image-clip',
      kind: 'image',
      name: 'Image',
      timelineStartMs: 0,
      timelineDurationMs: 1_000,
      sourceInMs: 0,
      sourceDurationMs: 1_000,
      playbackRate: 1.5,
      enabled: true,
      order: 0,
      assetId: 'image-asset',
      transform: { x: 0.1, y: 0.2, width: 0.6, height: 0.7 },
      appearance: { ...state.editorDefaults.value.visual?.image?.appearance },
      isMirrored: false,
      isMirroredY: false,
    } as VisualClip;
    const selectedZoom: ZoomElement = {
      id: 'zoom',
      sessionId: 'session',
      startMs: 100,
      endMs: 900,
      focus: { cx: 0.4, cy: 0.6 },
      depth: 4,
      mode: 'manual',
      projection: '3d',
      tiltIntensity: 0.84,
      tiltHorizontal: -0.4,
      tiltVertical: 0.3,
      tiltPreset: 'custom',
    };
    state.selectedClip.value = selectedClip;
    state.selectedZoom.value = selectedZoom;
    state.zoomMotionBlur.value = { enabled: false, intensity: 0.82 };
    mocks.saveProjectEditorState.mockResolvedValue(undefined);

    const editor = useProjectEditorState(state);
    await editor.saveNow();

    expect(mocks.updatePreferences).not.toHaveBeenCalled();
    expect(state.editorDefaults.value.zoom).toEqual({
      durationMs: 800,
      depth: 4,
      mode: 'manual',
      projection: '3d',
      tiltIntensity: 0.84,
      tiltHorizontal: -0.4,
      tiltVertical: 0.3,
      tiltPreset: 'custom',
    });
    expect(state.editorDefaults.value.zoomMotionBlur).toEqual({ enabled: false, intensity: 0.82 });
    expect(state.editorDefaults.value.visual?.image).toMatchObject({
      transform: selectedClip.transform,
      playbackRate: selectedClip.playbackRate,
      cameraLayoutPreset: 'custom',
      cameraFramingPreset: 'custom',
    });
  });

  it('sends a structured-cloneable editor state when reactive color-layer styles are present', async () => {
    const state = createState();
    const colorLayer: ColorClip = {
      id: 'color-layer',
      kind: 'color',
      name: 'Color layer',
      assetId: '',
      trackId: 'color-track',
      timelineStartMs: 0,
      timelineDurationMs: 1_000,
      sourceInMs: 0,
      sourceDurationMs: 1_000,
      playbackRate: 1,
      transitions: { entry: null, exit: null },
      enabled: true,
      order: 0,
      transform: { x: 0.1, y: 0.2, width: 0.7, height: 0.6 },
      fill: { kind: 'color', color: '#102030' },
      opacityEnabled: true,
      opacity: 58,
      cornerRadius: 'md',
      shadowSize: 'lg',
      shadowBlur: 24,
      shadowMode: 'adaptive',
      shadowColor: '#102030',
      shadowDirection: 'bottom-right',
      backdropBlurEnabled: true,
      backdropBlur: 36,
    };
    state.composition.value = reactive({ ...emptyComposition(), clips: [colorLayer] });
    state.editorDefaults.value = reactive(editorDefaults());
    state.selectedClip.value = reactive(colorLayer);
    mocks.saveProjectEditorState.mockResolvedValue(undefined);
    mocks.updatePreferences.mockResolvedValue(undefined);

    const editor = useProjectEditorState(state);
    await expect(editor.saveNow()).resolves.toBeUndefined();

    const payload = mocks.saveProjectEditorState.mock.calls[0]?.[1];
    expect(payload).toBeDefined();
    expect(() => structuredClone(payload)).not.toThrow();
    expect(payload).toEqual(JSON.parse(JSON.stringify(payload)));
    expect(mocks.updatePreferences).not.toHaveBeenCalled();
    expect(mocks.saveProjectEditorState.mock.calls[0]?.[1].composition.clips[0]).toEqual(colorLayer);
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
      schemaVersion: 3,
      composition: emptyComposition(),
      zoom: { elements: [], generatedSessions: [] },
      presentation: {
        canvas: { ...DEFAULT_OUTPUT_CANVAS },
        selectedBackgroundId: 'late',
        background: null,
        blurPercent: 0,
        importedBackgrounds: [],
        cursor: createDefaultCursorPresentation(),
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
