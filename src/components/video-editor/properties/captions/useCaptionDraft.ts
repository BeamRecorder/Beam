import { onBeforeUnmount, ref, watch, type Ref } from "vue";
import type { CaptionClip } from "../../composition/composition-types";

const cloneCaptionClip = (clip: CaptionClip): CaptionClip => ({
  ...clip,
  transform: clip.transform ? { ...clip.transform } : undefined,
  caption: {
    ...clip.caption,
    style: { ...clip.caption.style },
    sentences: clip.caption.sentences.map((sentence) => ({
      ...sentence,
      words: sentence.words.map((word) => ({ ...word })),
    })),
  },
});

export const useCaptionDraft = (
  clip: Ref<CaptionClip | null>,
  emitUpdate: (clip: CaptionClip) => void,
  delayMs = 500,
) => {
  const draft = ref<CaptionClip | null>(null);
  let saveTimer: ReturnType<typeof setTimeout> | null = null;
  let isDirty = false;
  const clearScheduledSave = () => {
    if (saveTimer === null) return;
    clearTimeout(saveTimer);
    saveTimer = null;
  };
  const flush = () => {
    clearScheduledSave();
    if (!draft.value || !isDirty) return;
    isDirty = false;
    emitUpdate(cloneCaptionClip(draft.value));
  };
  const scheduleSave = () => {
    clearScheduledSave();
    saveTimer = setTimeout(flush, delayMs);
  };
  const update = (change: (current: CaptionClip) => CaptionClip) => {
    if (!draft.value) return;
    draft.value = change(draft.value);
    isDirty = true;
    scheduleSave();
  };
  watch(() => clip.value?.id, () => {
    if (isDirty && draft.value?.id !== clip.value?.id) flush();
    clearScheduledSave();
    isDirty = false;
    draft.value = clip.value ? cloneCaptionClip(clip.value) : null;
  }, { immediate: true });
  watch(clip, (nextClip) => {
    if (!nextClip || isDirty || nextClip.id !== draft.value?.id) return;
    draft.value = cloneCaptionClip(nextClip);
  });
  onBeforeUnmount(flush);
  return { draft, flush, update };
};
