import { ref, watch, type Ref } from 'vue';
import type { CaptionClip } from '~/media/shared/composition-types';

const cloneCaption = (clip: CaptionClip): CaptionClip => ({
  ...clip,
  transform: clip.transform ? { ...clip.transform } : undefined,
  caption:
    clip.caption.type === 'text'
      ? {
          ...clip.caption,
          style: { ...clip.caption.style },
          sentences: clip.caption.sentences.map((sentence) => ({
            ...sentence,
            words: sentence.words.map((word) => ({ ...word })),
          })),
        }
      : {
          ...clip.caption,
          style: { ...clip.caption.style },
          steps: clip.caption.steps.map((step) => ({ ...step, modifiers: [...step.modifiers] })),
        },
});

export const useCaptionDraft = (clip: Ref<CaptionClip | null>, emitUpdate: (clip: CaptionClip) => void) => {
  const draft = ref<CaptionClip | null>(null);

  const flush = () => {
    if (draft.value) {
      emitUpdate(cloneCaption(draft.value));
    }
  };

  const update = (change: (current: CaptionClip) => CaptionClip) => {
    if (!draft.value) return;
    draft.value = change(draft.value);
    emitUpdate(cloneCaption(draft.value));
  };

  watch(
    clip,
    (next) => {
      draft.value = next ? cloneCaption(next) : null;
    },
    { deep: true, immediate: true },
  );

  return { draft, flush, update };
};
