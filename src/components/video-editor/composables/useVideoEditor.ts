import { computed, onScopeDispose, ref, watch, type Ref } from "vue";
import { capture } from "../../../api/capture";
import type { CaptureProject, ProjectEditorData } from "../../../api/types/capture-api";
import { useVideoPlayer } from "./useVideoPlayer";
import { useCompositionAudio } from "./useCompositionAudio";
import { useCursorReplacer } from "../properties/cursor/useCursorReplacer";
import { useClipComposition } from "./useClipComposition";
import { useProjectZoom } from "./useProjectZoom";
import { useProjectEditorState } from "./useProjectEditorState";
import { createCompositionSnapshot } from "../../export/composition/snapshot";
import { DEFAULT_OUTPUT_CANVAS, type OutputCanvasSettings } from "../canvas/output-canvas";
import { compositionDurationMs } from "../composition/engine/clip-engine";

export function useVideoEditor(options: {
  videoSrc: Ref<string | null | undefined>;
  project: Ref<CaptureProject | null | undefined>;
  editorData: Ref<ProjectEditorData | null | undefined>;
}) {
  const { project, editorData } = options;
  const activeTab = ref("canvas");
  const systemVolume = ref(100);
  const micVolume = ref(100);
  const sourceSize = ref({ width: 1920, height: 1080 });
  const outputCanvas = ref<OutputCanvasSettings>({ ...DEFAULT_OUTPUT_CANVAS });
  const player = useVideoPlayer();
  const durationMs = computed(() => Math.round(player.duration.value * 1_000));
  const cursor = useCursorReplacer();

  watch(options.videoSrc, (source) => { player.videoSrc.value = source ?? null; }, { immediate: true });
  const compositionState = useClipComposition({
    project,
    editorData,
    currentTimeSec: player.currentTime,
    activeTab,
  });
  useCompositionAudio({
    composition: compositionState.composition,
    currentTime: player.currentTime,
    isPlaying: player.isPlaying,
    volume: player.volume,
  });
  const zoomState = useProjectZoom({ editorData, durationMs, activeTab });
  const editorState = useProjectEditorState({
    project,
    composition: compositionState.composition,
    zoomElements: zoomState.zoomElements,
    generatedSessions: zoomState.generatedSessions,
    importedBackgrounds: player.importedBackgrounds,
    selectedBackground: player.selectedBackground,
    backgroundBlurPercent: player.backgroundBlurPercent,
    canvas: outputCanvas,
    cursorEffects: cursor.clickEffects,
    cursorEffectsEditing: cursor.clickEffectsEditing,
    availableBackgrounds: player.backgroundGroups,
  });

  const refreshBackgroundLibrary = async () => player.setUserBackgrounds(await capture.listBackgroundLibrary());
  void refreshBackgroundLibrary().catch((error) => console.error("Failed to load background library:", error));
  const stopBackgroundSubscription = capture.onBackgroundLibraryChanged(() => {
    void refreshBackgroundLibrary().catch((error) => console.error("Failed to refresh background library:", error));
  });
  onScopeDispose(stopBackgroundSubscription);

  const sourceFps = computed(() => {
    const screen = editorData.value?.tracks.find((track) => track.kind === "screen");
    const value = screen?.format.frameRate ?? screen?.format.fps;
    return typeof value === "number" && Number.isFinite(value) && value > 0 ? value : 30;
  });
  const exportRequest = computed(() => {
    if (!project.value) return null;
    try {
      return {
        projectName: project.value.name,
        snapshot: createCompositionSnapshot({
          duration: compositionDurationMs(compositionState.composition.value) / 1_000,
          width: sourceSize.value.width,
          height: sourceSize.value.height,
          canvas: outputCanvas.value,
          fps: sourceFps.value,
          background: player.selectedBackgroundMedia.value,
          blurPercent: player.backgroundBlurPercent.value,
          editorData: editorData.value,
          zooms: zoomState.zoomElements.value,
          composition: compositionState.composition.value,
          cursorSettings: {
            selectedCursor: cursor.selectedCursor.value,
            size: cursor.cursorSize.value,
            color: cursor.cursorColor.value,
            shadow: {
              enabled: cursor.enableShadow.value,
              blur: cursor.shadowBlur.value,
              color: cursor.shadowColor.value,
              direction: cursor.shadowDirection.value,
            },
            clickEffects: cursor.clickEffects.value,
          },
        }),
      };
    } catch {
      return null;
    }
  });

  watch(() => project.value?.id, async (id) => {
    if (!id) return;
    try {
      await editorState.load(id);
      compositionState.synchronizeRecording();
      player.duration.value = compositionDurationMs(compositionState.composition.value) / 1_000;
      zoomState.ensureAutomaticZooms();
      editorState.scheduleSave();
    } catch (error) {
      console.error("Failed to load editor state:", error);
    }
  }, { immediate: true });
  watch(editorData, () => {
    compositionState.synchronizeRecording();
    player.duration.value = compositionDurationMs(compositionState.composition.value) / 1_000;
  }, { deep: true });
  watch(compositionState.composition, (composition) => {
    player.duration.value = compositionDurationMs(composition) / 1_000;
    if (player.currentTime.value > player.duration.value) player.currentTime.value = player.duration.value;
  }, { deep: true });

  return {
    activeTab,
    systemVolume,
    micVolume,
    sourceSize,
    outputCanvas,
    player,
    cursor,
    compositionState,
    editorState,
    zoomState,
    exportRequest,
    handleSelectTab: (tab: string) => { activeTab.value = tab; },
  };
}
