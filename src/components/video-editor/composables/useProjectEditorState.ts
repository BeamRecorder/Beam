import { computed, ref, toRaw, watch, type Ref } from "vue";
import { capture } from "../../../api/capture";
import type { CaptureProject, ProjectEditorHistory, ProjectEditorState } from "../../../api/types/capture-api";
import type { ClipComposition } from "../composition/composition-types";
import type { ZoomElement } from "../zoom/zoom-types";
import { BACKGROUND_MEDIA, normalizeBackgroundValue, type BackgroundMedia, type BackgroundValue } from "./backgroundCatalog";
import type { OutputCanvasSettings } from "../canvas/output-canvas";

const clone = <T>(value: T): T => structuredClone(toRaw(value));

export function useProjectEditorState(options: {
  project: Ref<CaptureProject | null | undefined>;
  composition: Ref<ClipComposition>;
  zoomElements: Ref<ZoomElement[]>;
  generatedSessions: Ref<ProjectEditorState["zoom"]["generatedSessions"]>;
  importedBackgrounds: Ref<BackgroundMedia[]>;
  selectedBackground: Ref<BackgroundValue | null>;
  backgroundBlurPercent: Ref<number>;
  canvas: Ref<OutputCanvasSettings>;
  availableBackgrounds: Ref<Array<{ items: BackgroundMedia[] }>>;
}) {
  const loading = ref(false);
  const history = ref<ProjectEditorHistory>({ undo: [], redo: [] });
  const scheduledSave = ref(false);
  const pendingSaves = ref(0);
  const isSaving = computed(() => scheduledSave.value || pendingSaves.value > 0);
  let timer: ReturnType<typeof setTimeout> | null = null;
  let writeChain = Promise.resolve();
  let savedBackgroundId: string | null = null;

  const snapshot = (): ProjectEditorState => {
    const canvas = options.canvas.value;
    return {
      schemaVersion: 2,
      composition: clone(options.composition.value),
      zoom: {
        elements: options.zoomElements.value.map((zoom) => clone(zoom)),
        generatedSessions: options.generatedSessions.value.map((session) => clone(session)),
      },
      presentation: {
        canvas: { preset: canvas.preset, width: canvas.width, height: canvas.height, showBackground: canvas.showBackground },
        selectedBackgroundId: options.selectedBackground.value?.id ?? savedBackgroundId,
        background: options.selectedBackground.value && !["image", "video"].includes(options.selectedBackground.value.kind) ? clone(options.selectedBackground.value) : null,
        blurPercent: Math.max(0, Math.min(100, Math.round(options.backgroundBlurPercent.value))),
        importedBackgrounds: [],
      },
      history: clone(history.value),
    };
  };

  const saveNow = () => {
    if (timer) { clearTimeout(timer); timer = null; }
    scheduledSave.value = false;
    if (loading.value || !options.project.value) return Promise.resolve();
    const projectId = options.project.value.id;
    let state: ProjectEditorState;
    try { state = snapshot(); } catch (error) {
      return Promise.reject(new Error(`Impossible de sérialiser l'état éditeur: ${error instanceof Error ? error.message : String(error)}`));
    }
    pendingSaves.value += 1;
    writeChain = writeChain
      .catch(() => undefined)
      .then(() => capture.saveProjectEditorState(projectId, state))
      .then(() => undefined)
      .finally(() => { pendingSaves.value = Math.max(0, pendingSaves.value - 1); });
    return writeChain;
  };

  const scheduleSave = () => {
    if (loading.value || !options.project.value) return;
    if (timer) clearTimeout(timer);
    scheduledSave.value = true;
    timer = setTimeout(() => { void saveNow().catch((error) => console.error("Failed to save editor state:", error)); }, 250);
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
      const selected = normalizeBackgroundValue(state.presentation.background)
        ?? globalBackgrounds.find((item) => item.id === state.presentation.selectedBackgroundId || item.path === state.presentation.selectedBackgroundId)
        ?? BACKGROUND_MEDIA.find((item) => item.id === state.presentation.selectedBackgroundId || item.path === state.presentation.selectedBackgroundId)
        ?? null;
      options.selectedBackground.value = selected;
      options.backgroundBlurPercent.value = Math.max(0, Math.min(100, Number(state.presentation.blurPercent) || 0));
      options.canvas.value = state.presentation.canvas;
      history.value = state.history;
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
    ],
    scheduleSave,
    { deep: true },
  );
  watch(options.availableBackgrounds, (groups) => {
    if (!savedBackgroundId || options.selectedBackground.value) return;
    const selected = groups.flatMap((group) => group.items).find((item) => item.id === savedBackgroundId || item.path === savedBackgroundId);
    if (selected) options.selectedBackground.value = selected;
  }, { deep: true });

  return { load, saveNow, scheduleSave, isSaving, history, loading };
}
