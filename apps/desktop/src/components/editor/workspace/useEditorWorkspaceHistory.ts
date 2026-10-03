import { computed, watch } from 'vue';
import type { CaptionInlineEditingEnd } from '~/components/editor/canvas/caption-inline-editing';
import { useEditorUndoRedo, type EditorStateSnapshot } from '~/components/editor/composables/useEditorUndoRedo';
import { useAudioNormalization } from '../composables/useAudioNormalization';
import { useEditorVoiceover } from '../voiceover/useEditorVoiceover';
import type { EditorWorkspaceState } from './workspace-types';
export function useEditorWorkspaceHistory(state: EditorWorkspaceState) {
  const {
    player,
    compositionState,
    editorState,
    zoomState,
    outputCanvas,
    currentTime,
    duration,
    volume,
    selectedBackground,
    backgroundBlurPercent,
    composition,
    addImportedAsset,
    zoomElements,
    zoomMotionBlur,
    zoomAutoFollow,
    timelinePreviewDuration,
    isInlineCaptionEditing,
    props,
  } = state;
  // History owns the JSON copy. Passing live values avoids copying each field twice.
  const createEditorSnapshot = (): EditorStateSnapshot => ({
    composition: composition.value,
    zoomElements: zoomElements.value,
    zoomMotionBlur: zoomMotionBlur.value,
    zoomAutoFollow: zoomAutoFollow.value,
    outputCanvas: outputCanvas.value,
    selectedBackground: selectedBackground.value,
    backgroundBlurPercent: backgroundBlurPercent.value,
  });
  const {
    recordSnapshot,
    commitNow,
    undo,
    redo,
    canUndo,
    canRedo,
    lastAction: historyAction,
  } = useEditorUndoRedo({
    onRestoreSnapshot: async (snapshot) => {
      compositionState.restoreComposition(snapshot.composition);
      zoomState.restoreZoomElements(snapshot.zoomElements);
      if (snapshot.zoomMotionBlur) zoomMotionBlur.value = snapshot.zoomMotionBlur;
      if (snapshot.zoomAutoFollow) zoomAutoFollow.value = snapshot.zoomAutoFollow;
      outputCanvas.value = snapshot.outputCanvas;
      selectedBackground.value = snapshot.selectedBackground;
      backgroundBlurPercent.value = snapshot.backgroundBlurPercent;
      await editorState.saveNow();
    },
  });
  const audioNormalization = useAudioNormalization({
    composition,
    onCommit: () => {
      editorState.scheduleSave();
      commitNow(createEditorSnapshot());
    },
  });
  const voiceover = useEditorVoiceover({
    projectId: () => props.project?.id ?? null,
    currentTime,
    duration,
    projectVolume: volume,
    setPlaying: player.setPlaying,
    seek: async (seconds) => {
      await player.seek(seconds);
    },
    insert: (asset, inspection, startMs) => addImportedAsset(asset, inspection, startMs, undefined, 'voiceover'),
    normalize: async (clipId) => audioNormalization.normalizeClipIds([clipId]),
    onCommit: () => {
      editorState.scheduleSave();
      commitNow(createEditorSnapshot());
    },
  });
  const {
    discard: discardVoiceover,
    isOpen: isVoiceoverOpen,
    open: openVoiceover,
    pause: pauseVoiceover,
    resume: resumeVoiceover,
    selectMicrophone: selectVoiceoverMicrophone,
    start: startVoiceover,
    state: voiceoverState,
    stop: stopVoiceover,
    toggleMonitoring: toggleVoiceoverMonitoring,
    updateCountdown: updateVoiceoverCountdown,
  } = voiceover;
  const timelineBaseDuration = computed(() => {
    const voiceoverEndMs = voiceoverState.draft ? voiceoverState.draft.startMs + voiceoverState.draft.durationMs : 0;
    return Math.max(duration.value, voiceoverEndMs / 1_000, ...zoomElements.value.map((zoom) => zoom.endMs / 1_000));
  });
  const timelineDisplayDuration = computed(() => Math.max(timelinePreviewDuration.value, timelineBaseDuration.value));
  const beginInlineCaptionEditing = () => {
    if (isInlineCaptionEditing.value) return;
    isInlineCaptionEditing.value = true;
    commitNow(createEditorSnapshot());
  };
  const endInlineCaptionEditing = ({ cancelled }: CaptionInlineEditingEnd) => {
    if (!isInlineCaptionEditing.value) return;
    isInlineCaptionEditing.value = false;
    if (!cancelled) commitNow(createEditorSnapshot());
  };
  let historyInitialized = false;
  watch(
    editorState.loading,
    (loading) => {
      if (loading || historyInitialized) return;
      historyInitialized = true;
      recordSnapshot(createEditorSnapshot());
    },
    { immediate: true },
  );
  watch(
    composition,
    () => {
      if (historyInitialized && !editorState.loading.value && !isInlineCaptionEditing.value)
        recordSnapshot(createEditorSnapshot, 300);
    },
    { deep: true },
  );
  watch(
    [zoomElements, zoomMotionBlur, zoomAutoFollow, outputCanvas, selectedBackground, backgroundBlurPercent],
    () => {
      if (historyInitialized && !editorState.loading.value) recordSnapshot(createEditorSnapshot, 300);
    },
    { deep: true },
  );
  return {
    createEditorSnapshot,
    recordSnapshot,
    commitNow,
    undo,
    redo,
    canUndo,
    canRedo,
    historyAction,
    audioNormalization,
    voiceover,
    discardVoiceover,
    isVoiceoverOpen,
    openVoiceover,
    pauseVoiceover,
    resumeVoiceover,
    selectVoiceoverMicrophone,
    startVoiceover,
    voiceoverState,
    stopVoiceover,
    toggleVoiceoverMonitoring,
    updateVoiceoverCountdown,
    timelineBaseDuration,
    timelineDisplayDuration,
    beginInlineCaptionEditing,
    endInlineCaptionEditing,
    historyInitialized,
  };
}
