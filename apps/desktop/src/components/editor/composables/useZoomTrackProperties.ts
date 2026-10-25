import { computed, ref, type Ref } from 'vue';
import type { ZoomElement } from '@beam/engine/zoom/zoom-types';
import { applyZoomTrackProperties } from '@beam/engine/zoom/zoom-track-properties';
import { useTrackPropertyFeedback } from './useTrackPropertyFeedback';

export function useZoomTrackProperties(
  zooms: Ref<ZoomElement[]>,
  selectedId: Ref<string | null>,
  selectedIds: Ref<string[]>,
) {
  const appliesToAll = ref(false);
  const feedback = useTrackPropertyFeedback();
  const source = computed(() => zooms.value.find((zoom) => zoom.id === selectedId.value));
  const disabled = computed(
    () =>
      !source.value ||
      zooms.value.some((zoom) => (zoom.id === selectedId.value || selectedIds.value.includes(zoom.id)) && zoom.locked),
  );
  const announce = (force = false) =>
    feedback.announce(
      zooms.value.filter((zoom) => !zoom.locked).map((zoom) => ({ id: zoom.id, startMs: zoom.startMs })),
      selectedId.value!,
      force,
    );
  const synchronize = (next: ZoomElement[]) => {
    if (!appliesToAll.value || !selectedId.value || disabled.value) return next;
    const result = applyZoomTrackProperties(next, selectedId.value);
    if (result !== next) announce();
    return result;
  };
  const enabled = computed({
    get: () => appliesToAll.value,
    set: (value: boolean) => {
      if (value && (disabled.value || zooms.value.length < 2)) return;
      appliesToAll.value = value;
      if (value) {
        zooms.value = applyZoomTrackProperties(zooms.value, selectedId.value!);
        announce(true);
      }
    },
  });
  return {
    available: computed(() => zooms.value.length > 1 && Boolean(source.value)),
    disabled,
    enabled,
    restore: (value: boolean) => {
      appliesToAll.value = value;
      feedback.reset();
    },
    feedback: feedback.feedback,
    synchronize,
    reset: () => {
      appliesToAll.value = false;
      feedback.reset();
    },
  };
}
