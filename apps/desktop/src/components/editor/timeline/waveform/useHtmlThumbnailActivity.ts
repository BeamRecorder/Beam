import { computed, onScopeDispose, ref, watch, type Ref } from 'vue';
import type { HtmlThumbnailActivity } from './html-thumbnail-types';

/** Interaction lowers capture frequency without starving visible thumbnails. */
export function useHtmlThumbnailActivity(
  playing: Readonly<Ref<boolean>>,
  time: Readonly<Ref<number>>,
  ready: Readonly<Ref<boolean>>,
): HtmlThumbnailActivity {
  const seeking = ref(false);
  let settle: ReturnType<typeof setTimeout> | undefined;
  watch(
    time,
    () => {
      clearTimeout(settle);
      seeking.value = true;
      if (!playing.value)
        settle = setTimeout(() => {
          seeking.value = false;
        }, 180);
    },
    { flush: 'sync' },
  );
  watch(
    playing,
    (value) => {
      clearTimeout(settle);
      seeking.value = false;
      if (!value) {
        seeking.value = true;
        settle = setTimeout(() => {
          seeking.value = false;
        }, 180);
      }
    },
    { flush: 'sync' },
  );
  onScopeDispose(() => clearTimeout(settle));
  return {
    suspended: computed(() => !ready.value),
    interactive: computed(() => playing.value || seeking.value),
  };
}
