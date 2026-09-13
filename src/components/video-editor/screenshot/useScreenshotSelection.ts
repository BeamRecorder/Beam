import { computed, shallowRef, watch } from 'vue';
import type { ScreenshotLayer } from './screenshot-layer-types';
import type { ScreenshotSelectionMode } from './screenshot-types';

/** Selection belongs to the editor UI; the last selected member owns the properties. */
export function useScreenshotSelection(layers: () => ScreenshotLayer[]) {
  const selectedIds = shallowRef<string[]>([]);
  const ids = computed(() => new Set(layers().map((layer) => layer.id)));
  const select = (id: string | null, mode: ScreenshotSelectionMode = 'replace') => {
    if (id !== null && !ids.value.has(id)) return;
    if (mode === 'replace') selectedIds.value = id === null ? [] : [id];
    else if (id !== null) {
      selectedIds.value = selectedIds.value.includes(id)
        ? selectedIds.value.filter((selected) => selected !== id)
        : [...selectedIds.value, id];
    }
  };
  const selectedId = computed({
    get: () => selectedIds.value.at(-1) ?? null,
    set: (id: string | null) => select(id),
  });
  const reconcile = () => {
    const remaining = selectedIds.value.filter((id) => ids.value.has(id));
    if (remaining.length !== selectedIds.value.length) selectedIds.value = remaining;
  };
  watch(ids, reconcile);
  return { selectedIds, selectedId, select, reconcile };
}
