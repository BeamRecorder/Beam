import { computed, nextTick, onScopeDispose, ref, watch, type Ref } from 'vue';
import { capture } from '../../../api/capture';
import type { CaptureProject, ProjectEditorData } from '../../../api/types/capture-api';
import { useVideoPlayer } from './useVideoPlayer';
import { useCursorReplacer } from '../properties/cursor/useCursorReplacer';
import { useClipComposition } from './useClipComposition';
import { useProjectZoom } from './useProjectZoom';
import { normalizeZoomMotionBlur } from '../zoom/zoom-types';
import { useProjectEditorState } from './useProjectEditorState';
import { createCompositionSnapshot } from '../../export/composition/snapshot';
import { DEFAULT_OUTPUT_CANVAS, type OutputCanvasSettings } from '../canvas/output-canvas';
import { compositionDurationMs } from '~/media/shared';
import { isAudioClip, type AudioClip, type AudioRole } from '~/media/shared/composition-types';
import { setVolume } from '../composition/engine/clip-engine';
import { createDefaultCursorMotionSettings } from '../../../api/types/cursor-settings';
import { compositionPlaybackSignature } from './composition-playback-signature';
import { useToastStore } from '~/ui/toast/toastStore';
import { normalizeEditorPreferenceDefaults } from './editor-defaults';
import { useEditorPresets } from './useEditorPresets';

export function useVideoEditor(options: {
  project: Ref<CaptureProject | null | undefined>;
  editorData: Ref<ProjectEditorData | null | undefined>;
}) {
  const { project, editorData } = options;
  const toastStore = useToastStore();
  const activeTab = ref('canvas');
  const outputCanvas = ref<OutputCanvasSettings>({ ...DEFAULT_OUTPUT_CANVAS });
  const player = useVideoPlayer();
  const initialPlaybackSettled = ref(false);
  const cursor = useCursorReplacer();
  const cursorMotion = ref(createDefaultCursorMotionSettings());
  const includeAudioInExport = ref(true);
  const editorDefaults = ref(normalizeEditorPreferenceDefaults(undefined));

  const compositionState = useClipComposition({
    project,
    editorData,
    currentTimeSec: player.currentTime,
    activeTab,
    editorDefaults,
  });
  const roleVolume = (role: Extract<AudioRole, 'system' | 'microphone'>) =>
    computed({
      get: () =>
        compositionState.composition.value.clips.find(
          (clip): clip is AudioClip => isAudioClip(clip) && clip.role === role,
        )?.volume ?? 100,
      set: (volume: number) => {
        let next = compositionState.composition.value;
        for (const clip of next.clips) {
          if (isAudioClip(clip) && clip.role === role) next = setVolume(next, clip.id, volume);
        }
        compositionState.composition.value = next;
      },
    });
  const systemVolume = roleVolume('system');
  const micVolume = roleVolume('microphone');
  // Composition state is available before the asynchronous playback engine has
  // decoded metadata, so it is the authoritative duration for zoom generation.
  const durationMs = computed(() => compositionDurationMs(compositionState.composition.value));
  const zoomState = useProjectZoom({ editorData, durationMs, activeTab, editorDefaults });
  const editorState = useProjectEditorState({
    project,
    composition: compositionState.composition,
    zoomElements: zoomState.zoomElements,
    generatedSessions: zoomState.generatedSessions,
    zoomMotionBlur: zoomState.zoomMotionBlur,
    importedBackgrounds: player.importedBackgrounds,
    selectedBackground: player.selectedBackground,
    backgroundBlurPercent: player.backgroundBlurPercent,
    canvas: outputCanvas,
    cursorEffects: cursor.clickEffects,
    cursorMotion,
    cursorAutoHide: cursor.autoHide,
    cursorSelection: cursor.selection,
    cursorSize: cursor.cursorSize,
    cursorColor: cursor.cursorColor,
    cursorShadowEnabled: cursor.enableShadow,
    cursorShadowBlur: cursor.shadowBlur,
    cursorShadowColor: cursor.shadowColor,
    cursorShadowDirection: cursor.shadowDirection,
    availableBackgrounds: player.backgroundGroups,
    editorDefaults,
    selectedClip: compositionState.selectedClip,
    selectedZoom: zoomState.selectedZoom,
  });
  const editorPresets = useEditorPresets(editorDefaults);

  const refreshBackgroundLibrary = async () => player.setUserBackgrounds(await capture.listBackgroundLibrary());
  void refreshBackgroundLibrary().catch(() => console.error('Failed to load background library.'));
  const stopBackgroundSubscription = capture.onBackgroundLibraryChanged(() => {
    void refreshBackgroundLibrary().catch(() => console.error('Failed to refresh background library.'));
  });
  onScopeDispose(stopBackgroundSubscription);
  const refreshCursorPacks = async () => {
    cursor.importedPacks.value = await capture.listCursorPacks();
  };
  void refreshCursorPacks().catch(() => console.error('Failed to load cursor packs.'));
  const stopCursorSubscription = capture.onCursorPacksChanged(() => {
    void refreshCursorPacks().catch(() => console.error('Failed to refresh cursor packs.'));
  });
  onScopeDispose(stopCursorSubscription);

  const sourceFps = computed(() => {
    const screen = editorData.value?.tracks.find((track) => track.kind === 'screen');
    const value = screen?.format.frameRate ?? screen?.format.fps;
    return typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : 30;
  });
  const exportRequest = computed(() => {
    if (!project.value) return null;
    return {
      projectName: project.value.name,
      includeAudio: includeAudioInExport.value,
      snapshot: createCompositionSnapshot({
        duration: compositionDurationMs(compositionState.composition.value) / 1_000,
        canvas: outputCanvas.value,
        fps: sourceFps.value,
        background: player.selectedBackgroundMedia.value,
        blurPercent: player.backgroundBlurPercent.value,
        editorData: editorData.value,
        zooms: zoomState.zoomElements.value,
        zoomMotionBlur: normalizeZoomMotionBlur(zoomState.zoomMotionBlur?.value),
        composition: compositionState.composition.value,
        cursorSettings: {
          selection: cursor.selection.value,
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
          autoHide: cursor.autoHide.value,
        },
        cursorPack: cursor.selectedPack.value,
      }),
    };
  });

  let editorLoad = 0;
  watch(
    () => project.value?.id,
    async (id) => {
      if (!id) return;
      const request = ++editorLoad;
      try {
        await editorPresets.load(true);
        if (request !== editorLoad) return;
        await editorState.load(id);
        if (request !== editorLoad) return;
        compositionState.synchronizeRecording();
        zoomState.ensureAutomaticZooms();
        editorState.scheduleSave(false);
        await nextTick();
        if (request !== editorLoad) return;
        editorState.enableDefaultCapture();
      } catch (err: unknown) {
        if (request !== editorLoad) return;
        console.error('Failed to load editor state.', err);
        const errorMessage = err instanceof Error ? err.message : String(err);
        const errorStack = err instanceof Error && err.stack ? err.stack : errorMessage;
        toastStore.error(`Failed to load editor state: ${errorMessage}`, 0, {
          label: 'Copy error',
          copyText: errorStack,
          detail: errorMessage,
        });
      }
    },
    { immediate: true },
  );
  watch(
    editorData,
    () => {
      compositionState.synchronizeRecording();
      zoomState.ensureAutomaticZooms();
    },
    { deep: true },
  );
  let playbackLoad = 0;
  watch(
    () =>
      `${project.value?.id ?? ''}:${editorData.value?.sessionId ?? ''}:${compositionPlaybackSignature(compositionState.composition.value)}`,
    () => {
      if (!project.value) return;
      const request = ++playbackLoad;
      const composition = compositionState.composition.value;
      void player
        .loadComposition(composition)
        .catch((error: unknown) => {
          if (request !== playbackLoad) return;
          console.error(
            `[Beam media:editor] composition watcher load failed ${JSON.stringify({
              request,
              message: error instanceof Error ? error.message : 'Unknown playback error.',
            })}`,
          );
        })
        .finally(() => {
          if (request === playbackLoad) initialPlaybackSettled.value = true;
        });
    },
    { immediate: true, flush: 'post' },
  );
  return {
    activeTab,
    systemVolume,
    micVolume,
    outputCanvas,
    player,
    initialPlaybackSettled,
    cursor,
    cursorMotion,
    compositionState,
    editorState,
    zoomState,
    exportRequest,
    includeAudioInExport,
    editorDefaults,
    editorPresets,
    handleSelectTab: (tab: string) => {
      activeTab.value = tab;
    },
  };
}
