import { computed, ref, toRaw, watch, type Ref } from "vue";
import { capture } from "../../../api/capture";
import type { CaptureProject, ProjectEditorState } from "../../../api/types/capture-api";
import type { ProjectComposition } from "../composition/composition-types";
import type { ZoomElement } from "../zoom/zoom-types";
import type { BackgroundMedia } from "./backgroundMedia";
import type { OutputCanvasSettings } from '../canvas/output-canvas';

const cloneComposition = (value: ProjectComposition): ProjectComposition => structuredClone(toRaw(value));

export function useProjectEditorState(options: {
  project: Ref<CaptureProject | null | undefined>;
  composition: Ref<ProjectComposition>;
  zoomElements: Ref<ZoomElement[]>;
  generatedSessions: Ref<ProjectEditorState["zoom"]["generatedSessions"]>;
  importedBackgrounds: Ref<BackgroundMedia[]>;
  selectedBackground: Ref<string | null>;
  videoEnabled: Ref<boolean>;
  systemAudioEnabled: Ref<boolean>;
  micAudioEnabled: Ref<boolean>;
  canvas: Ref<OutputCanvasSettings>;
}) {
  const loading = ref(false);
  const scheduledSave = ref(false);
  const pendingSaves = ref(0);
  const isSaving = computed(() => scheduledSave.value || pendingSaves.value > 0);
  let timer: ReturnType<typeof setTimeout> | null = null;
  let writeChain = Promise.resolve();

  const snapshot = (): ProjectEditorState => {
    const selected = [...options.importedBackgrounds.value].find((item) => item.path === options.selectedBackground.value);
    const canvas = options.canvas.value;
    return {
      schemaVersion: 1,
      composition: cloneComposition(options.composition.value),
      zoom: {
        elements: options.zoomElements.value.map((zoom) => ({ ...toRaw(zoom), focus: { ...toRaw(zoom).focus } })),
        generatedSessions: options.generatedSessions.value.map((session) => ({ ...toRaw(session) })),
      },
      presentation: {
        canvas: { preset: canvas.preset, width: canvas.width, height: canvas.height, showBackground: canvas.showBackground },
        selectedBackgroundId: selected?.id ?? options.selectedBackground.value,
        importedBackgrounds: options.importedBackgrounds.value.map((background) => ({ id: background.id, name: background.name, path: background.path, extension: background.extension, kind: background.kind, ...(background.fileName ? { fileName: background.fileName } : {}) })),
        videoEnabled: options.videoEnabled.value,
        systemAudioEnabled: options.systemAudioEnabled.value,
        micAudioEnabled: options.micAudioEnabled.value,
      },
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
      const selected = [...state.presentation.importedBackgrounds].find((item) => item.id === state.presentation.selectedBackgroundId);
      options.selectedBackground.value = selected?.path ?? state.presentation.selectedBackgroundId;
      options.videoEnabled.value = state.presentation.videoEnabled;
      options.systemAudioEnabled.value = state.presentation.systemAudioEnabled;
      options.micAudioEnabled.value = state.presentation.micAudioEnabled;
      options.canvas.value = state.presentation.canvas;
    } finally { loading.value = false; }
  };

  watch(
    [
      options.composition,
      options.zoomElements,
      options.generatedSessions,
      options.importedBackgrounds,
      options.selectedBackground,
      options.videoEnabled,
      options.systemAudioEnabled,
      options.micAudioEnabled,
      options.canvas,
    ],
    scheduleSave,
    { deep: true },
  );
  return { load, saveNow, scheduleSave, isSaving };
}
