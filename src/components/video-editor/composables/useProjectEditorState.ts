import { ref, toRaw, watch, type Ref } from "vue";
import { capture } from "../../../api/capture";
import type { CaptureProject, ProjectEditorState } from "../../../api/types/capture-api";
import type { ProjectComposition } from "../composition/composition-types";
import type { ZoomElement } from "../zoom/zoom-types";
import type { BackgroundMedia } from "./backgroundMedia";

const plain = <T>(value: T): T => structuredClone(toRaw(value));

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
}) {
  const loading = ref(false);
  let timer: ReturnType<typeof setTimeout> | null = null;
  let writeChain = Promise.resolve();

  const snapshot = (): ProjectEditorState => {
    const selected = [...options.importedBackgrounds.value].find((item) => item.path === options.selectedBackground.value);
    return plain({
      schemaVersion: 1,
      composition: options.composition.value,
      zoom: { elements: options.zoomElements.value, generatedSessions: options.generatedSessions.value },
      presentation: {
        selectedBackgroundId: selected?.id ?? options.selectedBackground.value,
        importedBackgrounds: options.importedBackgrounds.value,
        videoEnabled: options.videoEnabled.value,
        systemAudioEnabled: options.systemAudioEnabled.value,
        micAudioEnabled: options.micAudioEnabled.value,
      },
    });
  };

  const saveNow = () => {
    if (timer) { clearTimeout(timer); timer = null; }
    if (loading.value || !options.project.value) return Promise.resolve();
    const projectId = options.project.value.id;
    const state = snapshot();
    writeChain = writeChain
      .catch(() => undefined)
      .then(() => capture.saveProjectEditorState(projectId, state))
      .then(() => undefined);
    return writeChain;
  };
  const scheduleSave = () => {
    if (loading.value || !options.project.value) return;
    if (timer) clearTimeout(timer);
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
    ],
    scheduleSave,
    { deep: true },
  );
  return { load, saveNow, scheduleSave };
}
