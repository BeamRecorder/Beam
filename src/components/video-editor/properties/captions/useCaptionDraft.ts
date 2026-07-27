import { onBeforeUnmount, ref, watch, type Ref } from "vue";
import type { CaptionCompositionLayer } from "../../composition/composition-types";

const cloneCaptionLayer = (
  layer: CaptionCompositionLayer,
): CaptionCompositionLayer => ({
  ...layer,
  caption: {
    ...layer.caption,
    style: { ...layer.caption.style },
    sentences: layer.caption.sentences.map((sentence) => ({
      ...sentence,
      words: sentence.words.map((word) => ({ ...word })),
    })),
  },
});

export const useCaptionDraft = (
  layer: Ref<CaptionCompositionLayer | null>,
  emitUpdate: (layer: CaptionCompositionLayer) => void,
  delayMs = 500,
) => {
  const draft = ref<CaptionCompositionLayer | null>(null);
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
    emitUpdate(cloneCaptionLayer(draft.value));
  };

  const scheduleSave = () => {
    clearScheduledSave();
    saveTimer = setTimeout(flush, delayMs);
  };

  const update = (
    change: (current: CaptionCompositionLayer) => CaptionCompositionLayer,
  ) => {
    if (!draft.value) return;
    draft.value = change(draft.value);
    isDirty = true;
    scheduleSave();
  };

  watch(
    () => layer.value?.id,
    () => {
      if (isDirty && draft.value?.id !== layer.value?.id) flush();
      clearScheduledSave();
      isDirty = false;
      draft.value = layer.value ? cloneCaptionLayer(layer.value) : null;
    },
    { immediate: true },
  );

  watch(layer, (nextLayer) => {
    if (!nextLayer || isDirty || nextLayer.id !== draft.value?.id) return;
    draft.value = cloneCaptionLayer(nextLayer);
  });

  onBeforeUnmount(flush);

  return { draft, flush, update };
};
