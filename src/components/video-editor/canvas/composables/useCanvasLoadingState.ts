import { computed, ref, watch, type ComputedRef } from 'vue';
import type { MediaError, MediaFrame } from '~/media/shared';
import type { VisualClip } from '~/media/shared/composition-types';

export function useCanvasLoadingState(options: {
  clip: ComputedRef<VisualClip | null>;
  frame: ComputedRef<MediaFrame | null>;
  playbackError: () => MediaError | null;
  playbackState: () => string;
}) {
  const renderedClipIds = ref<ReadonlySet<string>>(new Set());
  watch(
    options.frame,
    (frame) => {
      const clipId = options.clip.value?.id;
      if (!frame || !clipId || renderedClipIds.value.has(clipId)) return;
      renderedClipIds.value = new Set([...renderedClipIds.value, clipId]);
    },
    { immediate: true },
  );
  const showLoadingSkeleton = computed(() => {
    const clip = options.clip.value;
    if (!clip || options.playbackError() || renderedClipIds.value.has(clip.id)) return false;
    return options.playbackState() === 'loading' || !options.frame.value;
  });
  const isCanvasCovered = ref(showLoadingSkeleton.value);
  watch(showLoadingSkeleton, (loading) => {
    if (loading) isCanvasCovered.value = true;
  });
  return { showLoadingSkeleton, isCanvasCovered };
}
