import { ref, computed, watch, type Ref } from "vue";
import type { CaptureProject, ProjectEditorData } from "../../../api/types/capture-api";
import { useVideoPlayer } from "./useVideoPlayer";
import { useEditorAudio } from "./useEditorAudio";
import { useCursorReplacer } from "./useCursorReplacer";
import { useProjectComposition } from "./useProjectComposition";
import { useProjectZoom } from "./useProjectZoom";
import { useProjectEditorState } from "./useProjectEditorState";
import { createCompositionSnapshot } from "../../export/composition/snapshot";
import { DEFAULT_OUTPUT_CANVAS, type OutputCanvasSettings } from '../canvas/output-canvas';

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

  // 1. Video Player composable
  const player = useVideoPlayer();

  const durationMs = computed(() => Math.round(player.duration.value * 1000));

  // 2. Audio composable
  useEditorAudio({
    editorData,
    currentTime: player.currentTime,
    isPlaying: player.isPlaying,
    volume: player.volume,
    systemAudioEnabled: player.isSystemAudioEnabled,
    microphoneEnabled: player.isMicAudioEnabled,
  });

  // 3. Cursor Replacer composable
  const cursor = useCursorReplacer();

  // 4. Composition composable
  const compositionState = useProjectComposition({
    project,
    editorData,
    durationMs,
    currentTimeSec: player.currentTime,
    activeTab,
  });

  // 5. Zoom composable
  const zoomState = useProjectZoom({
    project,
    editorData,
    durationMs,
    activeTab,
  });

  const editorState = useProjectEditorState({
    project,
    composition: compositionState.composition,
    zoomElements: zoomState.zoomElements,
    generatedSessions: zoomState.generatedSessions,
    importedBackgrounds: player.importedBackgrounds,
    selectedBackground: player.selectedBackground,
    videoEnabled: player.isVideoEnabled,
    systemAudioEnabled: player.isSystemAudioEnabled,
    micAudioEnabled: player.isMicAudioEnabled,
    canvas: outputCanvas,
  });

  // Calculate source FPS
  const sourceFps = computed(() => {
    const screen = editorData.value?.tracks.find(
      (track) => track.kind === "screen",
    );
    const value = screen?.format.frameRate ?? screen?.format.fps;
    return typeof value === "number" && Number.isFinite(value) && value > 0
      ? value
      : 30;
  });

  // Export Request snapshot calculation
  const exportRequest = computed(() => {
    if (!project.value || !player.videoSrc.value) return null;
    try {
      const snapshot = createCompositionSnapshot({
        videoSrc: player.videoSrc.value,
        duration: player.duration.value,
        width: sourceSize.value.width,
        height: sourceSize.value.height,
        canvas: outputCanvas.value,
        fps: sourceFps.value,
        videoEnabled: player.isVideoEnabled.value,
        background: player.selectedBackgroundMedia.value,
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
          },
          ripple: {
            enabled: cursor.enableRipple.value,
            color: cursor.rippleColor.value,
            size: cursor.rippleSize.value,
          },
        },
        systemAudioEnabled: player.isSystemAudioEnabled.value,
        micAudioEnabled: player.isMicAudioEnabled.value,
      });
      return {
        projectName: project.value.name,
        snapshot,
      };
    } catch (e) {
      return null;
    }
  });

  const handleSelectTab = (tab: string) => {
    activeTab.value = tab;
  };

  // Load all persisted editor domains as one coherent snapshot.
  watch(
    () => project.value?.id,
    (id) => {
      if (id) {
        void editorState.load(id).catch((error) =>
          console.error("Failed to load editor state:", error),
        );
      }
    },
    { immediate: true },
  );

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
    handleSelectTab,
  };
}
