import { ref, type Ref } from 'vue';
import type { Clip, ClipComposition } from '~/media/shared/composition-types';
import type { ZoomElement } from '../zoom/zoom-types';
import { deleteTimelineItems, type TimelineDeleteMode } from '../composition/timeline-edit-operations';
import type { TimelineSelectionDelete } from '../timeline/composables/timeline-tracks-types';

export function useLinkedClipDeletion(options: {
  composition: Ref<ClipComposition>;
  selectedClipId: Ref<string | null>;
  selectedClipIds: Ref<string[]>;
  zoomElements: Ref<ZoomElement[]>;
  selectedZoomId: Ref<string | null>;
  selectedZoomIds: Ref<string[]>;
  onCommit?: () => void;
}) {
  const isDeleteDialogOpen = ref(false);
  const linkedDeleteClips = ref<Clip[]>([]);
  const pendingMode = ref<TimelineDeleteMode>('smart');
  const pendingZoomIds = ref<string[]>([]);

  const applyDeletion = (clipIds: readonly string[], zoomIds: readonly string[], mode: TimelineDeleteMode) => {
    const ids = new Set(clipIds);
    const zoomIdSet = new Set(zoomIds);
    const next = deleteTimelineItems({
      composition: options.composition.value,
      zoomElements: options.zoomElements.value,
      selection: { clipIds, zoomIds },
      mode,
    });
    options.composition.value = next.composition;
    options.zoomElements.value = next.zoomElements;
    options.selectedClipIds.value = options.selectedClipIds.value.filter((id) => !ids.has(id));
    if (options.selectedClipId.value && ids.has(options.selectedClipId.value)) {
      options.selectedClipId.value = options.selectedClipIds.value[0] ?? null;
    }
    options.selectedZoomIds.value = options.selectedZoomIds.value.filter((id) => !zoomIdSet.has(id));
    if (options.selectedZoomId.value && zoomIdSet.has(options.selectedZoomId.value))
      options.selectedZoomId.value = options.selectedZoomIds.value[0] ?? null;
    options.onCommit?.();
  };

  const requestTimelineDeletion = (selection: TimelineSelectionDelete) => {
    if (!selection.clipIds.length) {
      if (selection.zoomIds.length) applyDeletion([], selection.zoomIds, selection.mode);
      return;
    }
    const clipIds = selection.clipIds;
    const requestedIds = new Set(clipIds);
    const requested = options.composition.value.clips.filter((clip) => requestedIds.has(clip.id));
    if (!requested.length) {
      if (selection.zoomIds.length) applyDeletion([], selection.zoomIds, selection.mode);
      return;
    }

    const linkedGroupIds = new Set(requested.flatMap((clip) => (clip.groupId ? [clip.groupId] : [])));
    const candidates = options.composition.value.clips.filter(
      (clip) => requestedIds.has(clip.id) || Boolean(clip.groupId && linkedGroupIds.has(clip.groupId)),
    );
    const hasLinkedCandidates = candidates.some((clip) => clip.groupId && linkedGroupIds.has(clip.groupId));
    if (!hasLinkedCandidates) {
      applyDeletion(
        requested.map((clip) => clip.id),
        selection.zoomIds,
        selection.mode,
      );
      return;
    }

    linkedDeleteClips.value = candidates;
    pendingMode.value = selection.mode;
    pendingZoomIds.value = [...selection.zoomIds];
    isDeleteDialogOpen.value = true;
  };
  const requestClipDeletion = (clipIds: readonly string[]) =>
    requestTimelineDeletion({ clipIds: [...clipIds], zoomIds: [], mode: 'smart' });

  const deleteFromDialog = (clipIds: readonly string[]) => {
    const deletedIds = new Set(clipIds);
    const deletesEveryRemainingClip = linkedDeleteClips.value.every((clip) => deletedIds.has(clip.id));
    applyDeletion(clipIds, deletesEveryRemainingClip ? pendingZoomIds.value : [], pendingMode.value);
    if (deletesEveryRemainingClip) pendingZoomIds.value = [];
    linkedDeleteClips.value = linkedDeleteClips.value.filter((clip) => !deletedIds.has(clip.id));
  };

  const closeDeleteDialog = () => {
    isDeleteDialogOpen.value = false;
    linkedDeleteClips.value = [];
    pendingZoomIds.value = [];
    pendingMode.value = 'smart';
  };

  return {
    isDeleteDialogOpen,
    linkedDeleteClips,
    requestClipDeletion,
    requestTimelineDeletion,
    deleteFromDialog,
    closeDeleteDialog,
  };
}
