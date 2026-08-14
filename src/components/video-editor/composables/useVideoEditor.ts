import { computed, onScopeDispose, ref, watch, type Ref } from 'vue';
import { capture } from '../../../api/capture';
import type { CaptureProject, ProjectEditorData } from '../../../api/types/capture-api';
import { useVideoPlayer } from './useVideoPlayer';
import { useCursorReplacer } from '../properties/cursor/useCursorReplacer';
import { useClipComposition } from './useClipComposition';
import { useProjectZoom } from './useProjectZoom';
import { useProjectEditorState } from './useProjectEditorState';
import { createCompositionSnapshot } from '../../export/composition/snapshot';
import { DEFAULT_OUTPUT_CANVAS, type OutputCanvasSettings } from '../canvas/output-canvas';
import { compositionDurationMs } from '~/media/shared';
import { createDefaultCursorMotionSettings } from '../../../api/types/cursor-settings';

export function useVideoEditor(options: {
  project: Ref<CaptureProject | null | undefined>;
  editorData: Ref<ProjectEditorData | null | undefined>;
}) {
  const { project, editorData } = options;
  const activeTab = ref('canvas');
  const systemVolume = ref(100);
  const micVolume = ref(100);
  const outputCanvas = ref<OutputCanvasSettings>({ ...DEFAULT_OUTPUT_CANVAS });
  const player = useVideoPlayer();
  const durationMs = computed(() => Math.round(player.duration.value * 1_000));
  const cursor = useCursorReplacer();
  const cursorMotion = ref(createDefaultCursorMotionSettings());

  const compositionState = useClipComposition({
    project,
    editorData,
    currentTimeSec: player.currentTime,
    activeTab,
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
    cursorMotion,
    selectedCursor: cursor.selectedCursor,
    cursorSize: cursor.cursorSize,
    cursorColor: cursor.cursorColor,
    cursorShadowEnabled: cursor.enableShadow,
    cursorShadowBlur: cursor.shadowBlur,
    cursorShadowColor: cursor.shadowColor,
    cursorShadowDirection: cursor.shadowDirection,
    availableBackgrounds: player.backgroundGroups,
  });

  const refreshBackgroundLibrary = async () => player.setUserBackgrounds(await capture.listBackgroundLibrary());
  void refreshBackgroundLibrary().catch(() => console.error('Failed to load background library.'));
  const stopBackgroundSubscription = capture.onBackgroundLibraryChanged(() => {
    void refreshBackgroundLibrary().catch(() => console.error('Failed to refresh background library.'));
  });
  onScopeDispose(stopBackgroundSubscription);

  const sourceFps = computed(() => {
    const screen = editorData.value?.tracks.find((track) => track.kind === 'screen');
    const value = screen?.format.frameRate ?? screen?.format.fps;
    return typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : 30;
  });
  const exportRequest = computed(() => {
    if (!project.value) return null;
    return {
      projectName: project.value.name,
      snapshot: createCompositionSnapshot({
        duration: compositionDurationMs(compositionState.composition.value) / 1_000,
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
          motion: cursorMotion.value,
        },
      }),
    };
  });

  watch(
    () => project.value?.id,
    async (id) => {
      if (!id) return;
      try {
        await editorState.load(id);
        compositionState.synchronizeRecording();
        zoomState.ensureAutomaticZooms();
        editorState.scheduleSave();
      } catch {
        console.error('Failed to load editor state.');
      }
    },
    { immediate: true },
  );
  watch(
    editorData,
    () => {
      compositionState.synchronizeRecording();
    },
    { deep: true },
  );
  let playbackLoad = 0;
  watch(
    compositionState.composition,
    (composition) => {
      const request = ++playbackLoad;
      void player.loadComposition(composition).catch((error: unknown) => {
        if (request !== playbackLoad) return;
        console.error(
          `[Beam media:editor] composition watcher load failed ${JSON.stringify({
            request,
            message: error instanceof Error ? error.message : 'Unknown playback error.',
          })}`,
        );
      });
    },
    { deep: true, immediate: true, flush: 'post' },
  );
  return {
    activeTab,
    systemVolume,
    micVolume,
    outputCanvas,
    player,
    cursor,
    cursorMotion,
    compositionState,
    editorState,
    zoomState,
    exportRequest,
    handleSelectTab: (tab: string) => {
      activeTab.value = tab;
    },
  };
}
