import { computed, ref, watch, type Ref } from 'vue';
import { createFuzzySearchEngine } from '../select/fuzzy-search';
import type { CommandPaletteItem } from './command-palette-types';

export function useCommandPalette(items: Ref<CommandPaletteItem[]>) {
  const query = ref('');
  const path = ref<string[]>([]);
  const current = ref(0);
  const forwardPaths = ref<string[][]>([]);
  const branches = computed(() => {
    const result: CommandPaletteItem[] = [];
    let children = items.value;
    for (const id of path.value) {
      const branch = children.find((item) => item.id === id && item.children);
      if (!branch) break;
      result.push(branch);
      children = branch.children!;
    }
    return result;
  });
  const scope = computed(() => branches.value.at(-1)?.children ?? items.value);
  const searchable = computed(() => {
    const collect = (entries: CommandPaletteItem[], parent = ''): CommandPaletteItem[] =>
      entries.flatMap((item) => [
        { ...item, terms: [...(item.terms ?? []), parent] },
        ...(item.children ? collect(item.children, `${parent} ${item.label}`) : []),
      ]);
    return collect(scope.value);
  });
  const engine = computed(() =>
    createFuzzySearchEngine(searchable.value, (item) => [item.label, item.detail ?? '', ...(item.terms ?? [])]),
  );
  const results = computed(() => (query.value.trim() ? engine.value.search(query.value) : scope.value));
  watch(
    () => results.value.map((item) => item.id).join('\u0000'),
    () => {
      current.value = 0;
    },
  );
  const reset = () => {
    path.value = [];
    query.value = '';
    current.value = 0;
    forwardPaths.value = [];
  };
  const enter = (item: CommandPaletteItem) => {
    if (!item.children || item.disabled) return false;
    // Global search may find a nested category; locate its complete breadcrumb.
    const find = (entries: CommandPaletteItem[], prefix: string[]): string[] | undefined => {
      for (const entry of entries) {
        if (entry.id === item.id) return [...prefix, entry.id];
        const nested = entry.children && find(entry.children, [...prefix, entry.id]);
        if (nested) return nested;
      }
    };
    forwardPaths.value = [];
    path.value = find(items.value, []) ?? [];
    query.value = '';
    return true;
  };
  const back = () => {
    if (path.value.length) forwardPaths.value.push([...path.value]);
    path.value = path.value.slice(0, -1);
    query.value = '';
  };
  const forward = () => {
    const next = forwardPaths.value.pop();
    if (next) {
      path.value = next;
      query.value = '';
    }
  };
  const move = (delta: number) => {
    if (results.value.length) current.value = (current.value + delta + results.value.length) % results.value.length;
  };
  return {
    query,
    path,
    branches,
    current,
    results,
    reset,
    enter,
    back,
    forward,
    move,
  };
}
