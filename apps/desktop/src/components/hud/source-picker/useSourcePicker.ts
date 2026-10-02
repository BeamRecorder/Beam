import { computed, onBeforeUnmount, onMounted, ref } from 'vue';
import type { SourcePickerAction, SourcePickerState, SourcePickerKind } from '~/api/types/source-picker';

export function useSourcePicker(initialKind: SourcePickerKind) {
  const state = ref<SourcePickerState>({
    kind: initialKind,
    highlightedId: null,
    selectedId: null,
    sources: [],
    development: false,
    error: null,
  });
  const highlighted = computed(
    () => state.value.sources.find((source) => source.id === state.value.highlightedId) ?? null,
  );
  const selected = computed(() => state.value.sources.find((source) => source.id === state.value.selectedId) ?? null);
  let unsubscribe: (() => void) | undefined;
  const send = (action: SourcePickerAction) => window.capture?.sourcePickerAction(action);
  onMounted(() => {
    unsubscribe = window.capture?.onSourcePickerState((next) => {
      state.value = next;
    });
    window.capture?.notifySourcePickerReady();
  });
  onBeforeUnmount(() => unsubscribe?.());
  return { state, highlighted, selected, send };
}
