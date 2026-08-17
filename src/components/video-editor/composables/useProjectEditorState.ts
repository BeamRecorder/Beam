import { computed, getCurrentScope, onScopeDispose, ref, toRaw, watch, type Ref } from 'vue';
import { capture } from '../../../api/capture';
import type { CaptureProject, ProjectEditorState } from '../../../api/types/capture-api';
import type { Clip, ClipComposition } from '~/media/shared/composition-types';
import type { ZoomElement } from '../zoom/zoom-types';
import {
  BACKGROUND_MEDIA,
  findMatchingBackgroundMedia,
  getRandomBackgroundImage,
  normalizeBackgroundValue,
  type BackgroundMedia,
  type BackgroundValue,
} from './backgroundCatalog';
import type { OutputCanvasSettings } from '../canvas/output-canvas';
import { type CursorClickEffects, type CursorMotionSettings } from '../../../api/types/cursor-settings';
import type { CursorShadowDirection } from '../../../api/types/cursor-presentation';
import type { CursorSelection } from '../../../api/types/cursor-pack';
import { propertyInteractionActive } from '../../../composables/property-interaction';
import type { EditorPreferenceDefaults } from './editor-default-types';
import {
  applyFreshPresentationDefaults,
  defaultsFromEditorState,
  normalizeEditorPreferenceDefaults,
} from './editor-defaults';

const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;

export function useProjectEditorState(options: {
  project: Ref<CaptureProject | null | undefined>;
  composition: Ref<ClipComposition>;
  zoomElements: Ref<ZoomElement[]>;
  generatedSessions: Ref<ProjectEditorState['zoom']['generatedSessions']>;
  importedBackgrounds: Ref<BackgroundMedia[]>;
  selectedBackground: Ref<BackgroundValue | null>;
  backgroundBlurPercent: Ref<number>;
  canvas: Ref<OutputCanvasSettings>;
  cursorEffects: Ref<CursorClickEffects>;
  cursorMotion: Ref<CursorMotionSettings>;
  cursorSelection: Ref<CursorSelection>;
  cursorSize: Ref<number>;
  cursorColor: Ref<string>;
  cursorShadowEnabled: Ref<boolean>;
  cursorShadowBlur: Ref<number>;
  cursorShadowColor: Ref<string>;
  cursorShadowDirection: Ref<CursorShadowDirection>;
  availableBackgrounds: Ref<Array<{ items: BackgroundMedia[] }>>;
  editorDefaults: Ref<EditorPreferenceDefaults>;
  selectedClip: Ref<Clip | null>;
  selectedZoom: Ref<ZoomElement | null>;
}) {
  const loading = ref(false);
  const scheduledSave = ref(false);
  const pendingSaves = ref(0);
  const isSaving = computed(() => scheduledSave.value || pendingSaves.value > 0);
  let timer: ReturnType<typeof setTimeout> | null = null;
  let writeChain = Promise.resolve();
  let savedBackgroundId: string | null = null;
  let loadGeneration = 0;
  let defaultCaptureEnabled = true;
  let scheduledDefaultCapture = false;

  const snapshot = (): ProjectEditorState => ({
    schemaVersion: 3,
    composition: clone(options.composition.value),
    zoom: {
      elements: options.zoomElements.value.map((zoom) => ({ ...toRaw(zoom), focus: { ...toRaw(zoom).focus } })),
      generatedSessions: options.generatedSessions.value.map((session) => ({ ...toRaw(session) })),
    },
    presentation: {
      canvas: clone(options.canvas.value),
      selectedBackgroundId: options.selectedBackground.value?.id ?? savedBackgroundId,
      background:
        options.selectedBackground.value && !['image', 'video'].includes(options.selectedBackground.value.kind)
          ? clone(options.selectedBackground.value)
          : null,
      blurPercent: Math.max(0, Math.min(100, Math.round(options.backgroundBlurPercent.value))),
      importedBackgrounds: [],
      cursor: {
        selection: clone(options.cursorSelection.value),
        size: options.cursorSize.value,
        color: options.cursorColor.value,
        shadow: {
          enabled: options.cursorShadowEnabled.value,
          blur: options.cursorShadowBlur.value,
          color: options.cursorShadowColor.value,
          direction: options.cursorShadowDirection.value,
        },
        clickEffects: clone(options.cursorEffects.value),
        motion: clone(options.cursorMotion.value),
      },
    },
  });

  const saveNow = (captureDefaults = defaultCaptureEnabled) => {
    if (propertyInteractionActive.value) return Promise.resolve();
    const shouldCaptureDefaults = captureDefaults || scheduledDefaultCapture;
    scheduledDefaultCapture = false;
    if (timer) {
      clearTimeout(timer);
      timer = null;
    }
    scheduledSave.value = false;
    if (loading.value || !options.project.value) return Promise.resolve();
    const projectId = options.project.value.id;
    let state: ProjectEditorState;
    const selectedClip = options.selectedClip.value ? clone(options.selectedClip.value) : null;
    const selectedZoom = options.selectedZoom.value ? clone(options.selectedZoom.value) : null;
    try {
      state = snapshot();
    } catch (error) {
      return Promise.reject(
        new Error(`Impossible de sérialiser l'état éditeur: ${error instanceof Error ? error.message : String(error)}`),
      );
    }
    pendingSaves.value += 1;
    writeChain = writeChain
      .catch(() => undefined)
      .then(() => capture.saveProjectEditorState(projectId, state))
      .then(async () => {
        if (!shouldCaptureDefaults) return;
        const defaults = defaultsFromEditorState(options.editorDefaults.value, state, selectedClip, selectedZoom);
        options.editorDefaults.value = defaults;
        try {
          await capture.updatePreferences({ extras: { editorDefaults: defaults } });
        } catch {
          console.error('Failed to save editor defaults.');
        }
      })
      .then(() => undefined)
      .finally(() => {
        pendingSaves.value = Math.max(0, pendingSaves.value - 1);
      });
    return writeChain;
  };

  const scheduleSave = (captureDefaults = defaultCaptureEnabled) => {
    if (loading.value || !options.project.value || propertyInteractionActive.value) return;
    if (timer) clearTimeout(timer);
    scheduledDefaultCapture ||= captureDefaults;
    scheduledSave.value = true;
    timer = setTimeout(() => void saveNow(false).catch(() => console.error('Failed to save editor state.')), 250);
  };

  const load = async (projectId: string) => {
    const generation = ++loadGeneration;
    if (timer) clearTimeout(timer);
    timer = null;
    scheduledSave.value = false;
    scheduledDefaultCapture = false;
    defaultCaptureEnabled = false;
    loading.value = true;
    try {
      const [loadedState, preferences] = await Promise.all([
        capture.getProjectEditorState(projectId),
        capture.getPreferences().catch(() => null),
      ]);
      if (generation !== loadGeneration) return;
      options.editorDefaults.value = normalizeEditorPreferenceDefaults(preferences?.extras?.editorDefaults);
      const state = loadedState.isFresh
        ? applyFreshPresentationDefaults(loadedState, options.editorDefaults.value)
        : loadedState;
      options.composition.value = state.composition;
      options.zoomElements.value = state.zoom.elements;
      options.generatedSessions.value = state.zoom.generatedSessions;
      options.importedBackgrounds.value = state.presentation.importedBackgrounds;
      const globalBackgrounds = options.availableBackgrounds.value.flatMap((group) => group.items);
      savedBackgroundId = state.presentation.selectedBackgroundId;
      const loadedBg =
        normalizeBackgroundValue(state.presentation.background) ??
        findMatchingBackgroundMedia(globalBackgrounds, savedBackgroundId) ??
        findMatchingBackgroundMedia(BACKGROUND_MEDIA, savedBackgroundId) ??
        null;
      options.selectedBackground.value =
        loadedBg ??
        (savedBackgroundId
          ? null
          : (getRandomBackgroundImage(globalBackgrounds.length > 0 ? globalBackgrounds : BACKGROUND_MEDIA) ?? null));
      options.backgroundBlurPercent.value = Math.max(0, Math.min(100, Number(state.presentation.blurPercent) || 0));
      options.canvas.value = state.presentation.canvas;
      const cursor = state.presentation.cursor;
      options.cursorSelection.value = clone(cursor.selection);
      options.cursorSize.value = cursor.size;
      options.cursorColor.value = cursor.color;
      options.cursorShadowEnabled.value = cursor.shadow.enabled;
      options.cursorShadowBlur.value = cursor.shadow.blur;
      options.cursorShadowColor.value = cursor.shadow.color;
      options.cursorShadowDirection.value = cursor.shadow.direction;
      options.cursorEffects.value = clone(cursor.clickEffects);
      options.cursorMotion.value = clone(cursor.motion);
    } finally {
      if (generation === loadGeneration) loading.value = false;
    }
  };

  if (getCurrentScope()) {
    onScopeDispose(() => {
      loadGeneration += 1;
      if (timer) clearTimeout(timer);
      timer = null;
      scheduledSave.value = false;
      scheduledDefaultCapture = false;
    });
  }

  watch(
    [
      options.composition,
      options.zoomElements,
      options.generatedSessions,
      options.importedBackgrounds,
      options.selectedBackground,
      options.backgroundBlurPercent,
      options.canvas,
      options.cursorEffects,
      options.cursorMotion,
      options.cursorSelection,
      options.cursorSize,
      options.cursorColor,
      options.cursorShadowEnabled,
      options.cursorShadowBlur,
      options.cursorShadowColor,
      options.cursorShadowDirection,
    ],
    () => scheduleSave(),
    { deep: true },
  );

  watch(
    propertyInteractionActive,
    (active, wasActive) => {
      if (active) {
        if (timer) clearTimeout(timer);
        timer = null;
        scheduledSave.value = false;
        return;
      }
      if (wasActive) scheduleSave();
    },
    { flush: 'sync' },
  );

  watch(
    options.availableBackgrounds,
    (groups) => {
      if (!savedBackgroundId || options.selectedBackground.value) return;
      const selected = groups
        .flatMap((group) => group.items)
        .find((item) => item.id === savedBackgroundId || item.path === savedBackgroundId);
      if (selected) options.selectedBackground.value = selected;
    },
    { deep: true },
  );

  return {
    load,
    saveNow,
    scheduleSave,
    enableDefaultCapture: () => {
      defaultCaptureEnabled = true;
    },
    isSaving,
    loading,
  };
}
