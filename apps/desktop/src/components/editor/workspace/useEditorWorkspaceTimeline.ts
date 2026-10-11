import {
  TimelineLockedError,
  preservesLockedItems,
  preservesLockedAssets,
  setTimelineLocks,
} from '@beam/engine/composition/timeline-locks';
import { unlinkRecordingSidecars } from '@beam/engine/composition/recording-sidecars';
import type { RecordingSidecarUnlink } from '@beam/engine/composition/recording-sidecar-types';
import { removeTimelineGap } from '@beam/engine/composition/timeline-gaps';
import type { TimelineGap, TimelineLockRequest } from '@beam/engine/composition/timeline-lock-types';
import { useLinkedClipDeletion } from '~/components/editor/composables/useLinkedClipDeletion';
import { isAudioClip } from '@beam/engine/shared/composition-types';
import type { TimelinePasteRequest } from '~/components/editor/timeline/composables/timeline-clipboard-types';
import { pasteTimelineClipboard } from '~/components/editor/timeline/composables/paste-timeline-clipboard';
import type { AddVisualElementRequest } from '@beam/engine/composition/visual-element-types';
import { useTimelineClipboardFeedback } from '~/components/editor/timeline/composables/useTimelineClipboardFeedback';
import type { TimelineElementKind } from '../timeline/timeline-element-types';
import { shiftTimelineSelection } from '@beam/engine/composition/timeline-edit-operations';
import type { TimelineSelectionDelete, TimelineSelectionMove } from '../timeline/composables/timeline-tracks-types';
import type { EditorWorkspaceState, EditorWorkspaceHistory, EditorWorkspaceSelection } from './workspace-types';
export function useEditorWorkspaceTimeline(
  state: EditorWorkspaceState,
  history: EditorWorkspaceHistory,
  selection: EditorWorkspaceSelection,
  finishCrop: () => void,
) {
  const {
    t,
    tTimelineTracks,
    player,
    editorState,
    duration,
    composition,
    selectedClipId,
    selectedClipIds,
    selectClips,
    addElement,
    addVisualElementAtTime,
    zoomElements,
    selectedZoomId,
    selectedZoomIds,
    selectZooms,
    props,
  } = state;
  const { createEditorSnapshot, commitNow, openVoiceover } = history;
  const { openPropertiesPanel } = selection;
  const {
    isDeleteDialogOpen,
    linkedDeleteClips,
    requestClipDeletion,
    requestTimelineDeletion,
    deleteFromDialog,
    closeDeleteDialog,
  } = useLinkedClipDeletion({
    composition,
    selectedClipId,
    selectedClipIds,
    zoomElements,
    selectedZoomId,
    selectedZoomIds,
    onCommit: () => {
      editorState.scheduleSave();
      commitNow(createEditorSnapshot());
    },
  });
  const addTimelineElement = (kind: TimelineElementKind) => {
    finishCrop();
    if (kind === 'voiceover') {
      void openVoiceover();
      return;
    }
    void addElement(kind).catch(() => console.error('Unable to add media.'));
  };
  const addTimelineVisualElement = (request: AddVisualElementRequest) => {
    finishCrop();
    void addVisualElementAtTime(request).catch((error) => console.error('Unable to add timeline element.', error));
  };
  const deleteAudioRole = (role: 'system' | 'microphone') => {
    requestClipDeletion(
      composition.value.clips.filter((clip) => isAudioClip(clip) && clip.role === role).map((clip) => clip.id),
    );
  };
  const handlePlayingIntent = (playing: boolean) => {
    void player.setPlaying(playing).catch(() => console.error('Unable to change playback state.'));
  };
  const handleSeekIntent = (time: number, mode: 'seek' | 'scrub' = 'seek') => {
    void player.seek(time, mode).catch(() => console.error('Unable to seek media.'));
  };

  const {
    recentPaste,
    reportCopySuccess: reportTimelineCopySuccess,
    reportPasteError: reportTimelinePasteError,
    reportPasteSuccess: reportTimelinePasteSuccess,
  } = useTimelineClipboardFeedback();
  const pasteTimelineItem = (request: TimelinePasteRequest) => {
    try {
      const projectId = props.project?.id;
      if (!projectId || request.item.scopeId !== projectId) throw new Error(t('timelineClipboardDifferentProject'));
      finishCrop();
      const timelineDurationMs = Math.round(duration.value * 1_000);
      const pasted = pasteTimelineClipboard({
        composition: composition.value,
        zoomElements: zoomElements.value,
        item: request.item,
        timeMs: request.timeMs,
        timelineDurationMs,
        target: request.target,
      });
      if (
        !preservesLockedItems(composition.value.clips, pasted.composition.clips) ||
        !preservesLockedAssets(composition.value, pasted.composition) ||
        !preservesLockedItems(zoomElements.value, pasted.zoomElements)
      )
        throw new Error(tTimelineTracks('locked'));
      composition.value = pasted.composition;
      zoomElements.value = pasted.zoomElements;
      openPropertiesPanel();
      if (pasted.primary.type === 'clip') {
        selectZooms(pasted.zoomIds);
        selectClips(pasted.clipIds, pasted.primary.id);
      } else {
        selectClips(pasted.clipIds);
        selectZooms(pasted.zoomIds, pasted.primary.id);
      }
      editorState.scheduleSave();
      commitNow(createEditorSnapshot());
      reportTimelinePasteSuccess(pasted.primary, request.item);
    } catch (error) {
      reportTimelinePasteError(
        error instanceof TimelineLockedError
          ? tTimelineTracks('locked')
          : error instanceof Error
            ? error.message
            : String(error),
      );
    }
  };

  const unlinkSidecars = (request: RecordingSidecarUnlink) => {
    finishCrop();
    const next = unlinkRecordingSidecars(composition.value, zoomElements.value, request);
    if (next.composition === composition.value) return;
    commitNow(createEditorSnapshot());
    composition.value = next.composition;
    zoomElements.value = next.zoomElements;
    commitNow(createEditorSnapshot());
    editorState.scheduleSave();
  };
  const lockTimelineSelection = (request: TimelineLockRequest) => {
    finishCrop();
    commitNow(createEditorSnapshot());
    const next = setTimelineLocks(composition.value, zoomElements.value, request);
    composition.value = next.composition;
    zoomElements.value = next.zoomElements;
    commitNow(createEditorSnapshot());
    editorState.scheduleSave();
  };
  const closeTimelineGap = (gap: TimelineGap) => {
    finishCrop();
    const result = removeTimelineGap(composition.value, gap, zoomElements.value);
    if (result.composition === composition.value) return;
    commitNow(createEditorSnapshot());
    composition.value = result.composition;
    zoomElements.value = result.zoomElements;
    commitNow(createEditorSnapshot());
    editorState.scheduleSave();
  };
  const moveTimelineSelection = (request: TimelineSelectionMove) => {
    const next = shiftTimelineSelection({
      composition: composition.value,
      zoomElements: zoomElements.value,
      selection: request,
      deltaMs: request.deltaMs,
    });
    if (next.deltaMs === 0) return;
    composition.value = next.composition;
    zoomElements.value = next.zoomElements;
    editorState.scheduleSave();
    commitNow(createEditorSnapshot());
  };
  const deleteTimelineSelection = (request: TimelineSelectionDelete) => requestTimelineDeletion(request);
  const deleteSelectedTimelineZooms = () =>
    requestTimelineDeletion({
      clipIds: [],
      zoomIds: selectedZoomIds.value.length
        ? [...selectedZoomIds.value]
        : selectedZoomId.value
          ? [selectedZoomId.value]
          : [],
      mode: 'lift',
    });
  const deleteTimelineZoom = (id: string) => requestTimelineDeletion({ clipIds: [], zoomIds: [id], mode: 'lift' });
  return {
    isDeleteDialogOpen,
    linkedDeleteClips,
    requestClipDeletion,
    requestTimelineDeletion,
    deleteFromDialog,
    closeDeleteDialog,
    addTimelineElement,
    addTimelineVisualElement,
    deleteAudioRole,
    handlePlayingIntent,
    handleSeekIntent,
    recentPaste,
    reportTimelineCopySuccess,
    reportTimelinePasteError,
    reportTimelinePasteSuccess,
    pasteTimelineItem,
    unlinkSidecars,
    lockTimelineSelection,
    closeTimelineGap,
    moveTimelineSelection,
    deleteTimelineSelection,
    deleteSelectedTimelineZooms,
    deleteTimelineZoom,
  };
}
