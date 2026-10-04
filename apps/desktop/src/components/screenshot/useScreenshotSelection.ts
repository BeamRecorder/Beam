import { computed, shallowRef, watch } from 'vue';
import type { ScreenshotLayer } from '@beam/engine/screenshot/screenshot-types';
import type { ScreenshotSelectionMode } from './screenshot-types';

/** Selection belongs to the editor UI; the last selected member owns the properties. */
export function useScreenshotSelection(layers: () => ScreenshotLayer[]) {
  const selectedIds = shallowRef<string[]>([]);
  const ids = computed(() => new Set(layers().map((layer) => layer.id)));
  const expanded = (selected: readonly string[]) => {
    const values = new Set(selected),
      groups = new Set(
        layers()
          .filter((r) => values.has(r.id) && r.groupId)
          .map((r) => r.groupId),
      );
    for (const r of layers()) if (r.groupId && groups.has(r.groupId)) values.add(r.id);
    return [...values];
  };
  const select = (id: string | null, mode: ScreenshotSelectionMode = 'replace') => {
    if (id !== null && !ids.value.has(id)) return;
    const members = id === null ? [] : mode === 'individual' || mode === 'toggle-individual' ? [id] : expanded([id]);
    if (mode === 'replace' || mode === 'individual')
      selectedIds.value = id === null ? [] : [...members.filter((r) => r !== id), id];
    else if (id !== null) {
      const group = members;
      selectedIds.value = selectedIds.value.includes(id)
        ? selectedIds.value.filter((r) => !group.includes(r))
        : [...new Set([...selectedIds.value, ...group.filter((r) => r !== id), id])];
    }
  };
  const selectMany = (nextIds: string[], primaryId: string | null = nextIds.at(-1) ?? null) => {
    const valid = expanded(nextIds).filter((id) => ids.value.has(id));
    selectedIds.value =
      primaryId && valid.includes(primaryId) ? [...valid.filter((id) => id !== primaryId), primaryId] : valid;
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
  return { selectedIds, selectedId, select, selectMany, reconcile };
}
