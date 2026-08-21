import { ref, type Ref } from 'vue';
import type { Clip, ClipComposition } from '~/media/shared/composition-types';
import { deleteClip } from '../composition/engine/clip-engine';

export function useLinkedClipDeletion(options: {
  composition: Ref<ClipComposition>;
  selectedClipId: Ref<string | null>;
  selectedClipIds: Ref<string[]>;
}) {
  const isDeleteDialogOpen = ref(false);
  const linkedDeleteClips = ref<Clip[]>([]);

  const applyDeletion = (clipIds: readonly string[]) => {
    const ids = new Set(clipIds);
    let next = options.composition.value;
    for (const clipId of ids) {
      if (next.clips.some((clip) => clip.id === clipId)) next = deleteClip(next, clipId, false);
    }
    options.composition.value = next;
    options.selectedClipIds.value = options.selectedClipIds.value.filter((id) => !ids.has(id));
    if (options.selectedClipId.value && ids.has(options.selectedClipId.value)) {
      options.selectedClipId.value = options.selectedClipIds.value[0] ?? null;
    }
  };

  const requestClipDeletion = (clipIds: readonly string[]) => {
    const requestedIds = new Set(clipIds);
    const requested = options.composition.value.clips.filter((clip) => requestedIds.has(clip.id));
    if (!requested.length) return;

    const linkedGroupIds = new Set(requested.flatMap((clip) => (clip.groupId ? [clip.groupId] : [])));
    const candidates = options.composition.value.clips.filter(
      (clip) => requestedIds.has(clip.id) || Boolean(clip.groupId && linkedGroupIds.has(clip.groupId)),
    );
    const hasLinkedCandidates = candidates.some((clip) => clip.groupId && linkedGroupIds.has(clip.groupId));
    if (!hasLinkedCandidates) {
      applyDeletion(requested.map((clip) => clip.id));
      return;
    }

    linkedDeleteClips.value = candidates;
    isDeleteDialogOpen.value = true;
  };

  const deleteFromDialog = (clipIds: readonly string[]) => {
    applyDeletion(clipIds);
    const deletedIds = new Set(clipIds);
    linkedDeleteClips.value = linkedDeleteClips.value.filter((clip) => !deletedIds.has(clip.id));
  };

  const closeDeleteDialog = () => {
    isDeleteDialogOpen.value = false;
    linkedDeleteClips.value = [];
  };

  return {
    isDeleteDialogOpen,
    linkedDeleteClips,
    requestClipDeletion,
    deleteFromDialog,
    closeDeleteDialog,
  };
}
