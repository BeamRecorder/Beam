import { computed, ref, toRaw, watch, type Ref } from 'vue';
import { capture } from '../../../api/capture';
import type { CaptureProject, ProjectEditorState } from '../../../api/types/capture-api';
import type { ClipComposition } from '../composition/composition-types';
import type { ZoomElement } from '../zoom/zoom-types';
import {
  BACKGROUND_MEDIA,
  findMatchingBackgroundMedia,
  normalizeBackgroundValue,
  type BackgroundMedia,
  type BackgroundValue,
} from './backgroundCatalog';
import type { OutputCanvasSettings } from '../canvas/output-canvas';
import {
  createDefaultCursorMotionSettings,
  normalizeCursorClickEffects,
  normalizeCursorMotionSettings,
  type CursorClickEffects,
  type CursorMotionSettings,
} from '../../../api/types/cursor-settings';
import { propertyInteractionActive } from '../../../composables/property-interaction';

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
  availableBackgrounds: Ref<Array<{ items: BackgroundMedia[] }>>;
}) {
  const loading = ref(false);
  const scheduledSave = ref(false);
  const pendingSaves = ref(0);
  const isSaving = computed(() => scheduledSave.value || pendingSaves.value > 0);
  let timer: ReturnType<typeof setTimeout> | null = null;
  let writeChain = Promise.resolve();
  let savedBackgroundId: string | null = null;

  const snapshot = (): ProjectEditorState => ({
    schemaVersion: 2,
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
      cursorEffects: clone(options.cursorEffects.value),
      cursorMotion: clone(options.cursorMotion.value),
    },
  });

  const saveNow = () => {
    if (propertyInteractionActive.value) return Promise.resolve();
    if (timer) {
      clearTimeout(timer);
      timer = null;
    }
    scheduledSave.value = false;
    if (loading.value || !options.project.value) return Promise.resolve();
    const projectId = options.project.value.id;
    let state: ProjectEditorState;
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
      .then(() => undefined)
      .finally(() => {
        pendingSaves.value = Math.max(0, pendingSaves.value - 1);
      });
    return writeChain;
  };

  const scheduleSave = () => {
    if (loading.value || !options.project.value || propertyInteractionActive.value) return;
    if (timer) clearTimeout(timer);
    scheduledSave.value = true;
    timer = setTimeout(
      () => void saveNow().catch((error) => console.error('Failed to save editor state:', error)),
      250,
    );
  };

  const load = async (projectId: string) => {
    loading.value = true;
    try {
      const state = await capture.getProjectEditorState(projectId);
      options.composition.value = state.composition;
      options.zoomElements.value = state.zoom.elements;
      options.generatedSessions.value = state.zoom.generatedSessions;
      options.importedBackgrounds.value = state.presentation.importedBackgrounds;
      const globalBackgrounds = options.availableBackgrounds.value.flatMap((group) => group.items);
      savedBackgroundId = state.presentation.selectedBackgroundId;
      options.selectedBackground.value =
        normalizeBackgroundValue(state.presentation.background) ??
        findMatchingBackgroundMedia(globalBackgrounds, savedBackgroundId) ??
        findMatchingBackgroundMedia(BACKGROUND_MEDIA, savedBackgroundId) ??
        null;
      options.backgroundBlurPercent.value = Math.max(0, Math.min(100, Number(state.presentation.blurPercent) || 0));
      options.canvas.value = state.presentation.canvas;
      options.cursorEffects.value = normalizeCursorClickEffects(state.presentation.cursorEffects);
      options.cursorMotion.value = normalizeCursorMotionSettings(
        state.presentation.cursorMotion ?? createDefaultCursorMotionSettings(),
      );
    } finally {
      loading.value = false;
    }
  };

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
    ],
    scheduleSave,
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

  return { load, saveNow, scheduleSave, isSaving, loading };
}
