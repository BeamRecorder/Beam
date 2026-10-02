import { nextTick, ref, watch } from 'vue';
import type { CaptionInlineTextUpdate } from '~/components/video-editor/canvas/caption-inline-editing';
import { isTextCaptionClip } from '@beam/engine/shared/composition-types';
import { useMixedTimelineSelection } from '../composables/useMixedTimelineSelection';
import type { TimelineItemSelectionRequest } from '../timeline/composables/timeline-tracks-types';
import type { EditorWorkspaceState, EditorPropertiesHandle } from './workspace-types';
export function useEditorWorkspaceSelection(state: EditorWorkspaceState, finishCrop: () => void) {
  const {
    activeTab,
    editorState,
    handleSelectTab,
    composition,
    selectedClipId,
    selectedClipIds,
    selectedCaptionClip,
    selectClip,
    selectClips,
    updateCaption,
    zoomElements,
    selectedZoomId,
    selectedZoomIds,
    selectZooms,
    captionCompositionPreview,
    cursorPreview,
  } = state;
  const isPropertiesPanelOpen = ref(true);
  const openPropertiesPanel = () => {
    isPropertiesPanelOpen.value = true;
  };
  const selectPropertiesTab = (tab: string) => {
    if (activeTab.value === tab) {
      isPropertiesPanelOpen.value = !isPropertiesPanelOpen.value;
      return;
    }
    handleSelectTab(tab);
    openPropertiesPanel();
  };
  const {
    selectItem: selectTimelineItem,
    selectAll: selectAllTimelineItems,
    selectBox: selectTimelineBox,
    clearAll: clearTimelineSelection,
  } = useMixedTimelineSelection({
    composition,
    zoomElements,
    selectedClipId,
    selectedClipIds,
    selectedZoomId,
    selectedZoomIds,
    activeTab,
    openPropertiesPanel,
  });
  const selectEditorClip = (clipId: string) => {
    if (selectedClipId.value !== clipId || selectedClipIds.value.length !== 1) finishCrop();
    openPropertiesPanel();
    selectedZoomId.value = null;
    selectedZoomIds.value = [];
    selectClip(clipId);
    activeTab.value = 'clip';
  };
  const selectEditorTrack = (selection: { clipIds: string[]; primaryClipId: string | null; additive?: boolean }) => {
    finishCrop();
    openPropertiesPanel();
    if (!selection.additive) {
      selectedZoomId.value = null;
      selectedZoomIds.value = [];
    }
    selectClips(
      selection.additive ? [...selectedClipIds.value, ...selection.clipIds] : selection.clipIds,
      selection.primaryClipId,
    );
  };
  const selectEditorZoom = (zoomId: string) => {
    finishCrop();
    openPropertiesPanel();
    selectedClipId.value = null;
    selectedClipIds.value = [];
    selectZooms([zoomId], zoomId);
  };
  const selectEditorZoomTrack = (selection: {
    zoomIds: string[];
    primaryZoomId: string | null;
    additive?: boolean;
  }) => {
    finishCrop();
    openPropertiesPanel();
    if (!selection.additive) {
      selectedClipId.value = null;
      selectedClipIds.value = [];
    }
    selectZooms(
      selection.additive ? [...selectedZoomIds.value, ...selection.zoomIds] : selection.zoomIds,
      selection.primaryZoomId,
    );
  };
  const selectEditorCanvas = () => {
    finishCrop();
    openPropertiesPanel();
    clearTimelineSelection();
    activeTab.value = 'canvas';
  };
  const selectEditorCursor = () => {
    finishCrop();
    openPropertiesPanel();
    clearTimelineSelection();
    activeTab.value = 'cursor';
  };
  const propertiesPanelRef = ref<EditorPropertiesHandle | null>(null);
  const openCanvasTransition = (edge: 'entry' | 'exit') => {
    selectEditorCanvas();
    void nextTick(() => propertiesPanelRef.value?.openCanvasTransitions(edge));
  };
  const deselectTransformClip = () => {
    finishCrop();
    selectedClipId.value = null;
  };
  const replaceComposition = (value: typeof composition.value) => {
    captionCompositionPreview.value = null;
    const before = composition.value;
    composition.value = value;
    if (composition.value !== before) editorState.scheduleSave();
  };
  const previewComposition = (value: typeof composition.value | null) => {
    captionCompositionPreview.value = value;
  };
  watch([() => selectedCaptionClip.value?.id, activeTab], () => {
    captionCompositionPreview.value = null;
    cursorPreview.value = null;
  });
  const commitCaption = (clip: Parameters<typeof updateCaption>[0]) => {
    captionCompositionPreview.value = null;
    updateCaption(clip);
  };
  const updateInlineCaptionText = ({ clipId, customText }: CaptionInlineTextUpdate) => {
    const clip = composition.value.clips.find((candidate) => candidate.id === clipId);
    if (!clip || !isTextCaptionClip(clip)) return;
    if (selectedClipId.value !== clipId || selectedClipIds.value.length !== 1) selectEditorClip(clipId);
    commitCaption({
      ...clip,
      caption: {
        ...clip.caption,
        style: { ...clip.caption.style, customText },
      },
    });
  };
  const handleTimelineItemSelection = (request: TimelineItemSelectionRequest) => {
    finishCrop();
    selectTimelineItem(request);
  };
  return {
    isPropertiesPanelOpen,
    openPropertiesPanel,
    selectPropertiesTab,
    selectTimelineItem,
    selectAllTimelineItems,
    selectTimelineBox,
    clearTimelineSelection,
    selectEditorClip,
    selectEditorTrack,
    selectEditorZoom,
    selectEditorZoomTrack,
    selectEditorCanvas,
    selectEditorCursor,
    propertiesPanelRef,
    openCanvasTransition,
    deselectTransformClip,
    replaceComposition,
    previewComposition,
    commitCaption,
    updateInlineCaptionText,
    handleTimelineItemSelection,
  };
}
