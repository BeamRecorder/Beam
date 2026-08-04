import { onBeforeUnmount, ref, watch, type Ref } from 'vue'
import type { CaptionClip } from '../../composition/composition-types'

const cloneCaption = (clip: CaptionClip): CaptionClip => ({
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
})

export const useCaptionDraft = (
  clip: Ref<CaptionClip | null>,
  emitUpdate: (clip: CaptionClip) => void,
  delayMs = 16,
) => {
  const draft = ref<CaptionClip | null>(null)
  let timer: ReturnType<typeof setTimeout> | null = null
  let dirty = false
  const cancel = () => {
    if (timer) clearTimeout(timer)
    timer = null
  }
  const flush = () => {
    cancel()
    if (!draft.value || !dirty) return
    dirty = false
    emitUpdate(cloneCaption(draft.value))
  }
  const update = (change: (current: CaptionClip) => CaptionClip) => {
    if (!draft.value) return
    draft.value = change(draft.value)
    dirty = true
    cancel()
    timer = setTimeout(flush, delayMs)
  }
  watch(
    () => clip.value?.id,
    () => {
      if (dirty && draft.value?.id !== clip.value?.id) flush()
      cancel()
      dirty = false
      draft.value = clip.value ? cloneCaption(clip.value) : null
    },
    { immediate: true },
  )
  watch(
    clip,
    (next) => {
      if (!next || dirty || next.id !== draft.value?.id) return
      draft.value = cloneCaption(next)
    },
    { deep: true },
  )
  onBeforeUnmount(flush)
  return { draft, flush, update }
}
