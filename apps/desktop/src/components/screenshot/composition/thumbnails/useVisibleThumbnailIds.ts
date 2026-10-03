import { onScopeDispose, shallowRef, watch, type Ref } from 'vue';

/** Observe actual rows, including clipping by the panel and its scroll viewport. */
export function useVisibleThumbnailIds(list: Ref<HTMLElement | null>, order: () => readonly string[]) {
  const visible = shallowRef<ReadonlySet<string>>(new Set());
  let observer: IntersectionObserver | undefined;
  let mutation: MutationObserver | undefined;
  const rows = new Set<Element>();
  let generation = 0;
  const disconnect = () => {
    ++generation;
    observer?.disconnect();
    mutation?.disconnect();
    observer = undefined;
    mutation = undefined;
    rows.clear();
    visible.value = new Set();
  };
  const attach = () => {
    const current = new Set(list.value?.querySelectorAll('[data-layer-id]') ?? []);
    for (const row of rows)
      if (!current.has(row)) {
        observer?.unobserve(row);
        rows.delete(row);
      }
    for (const row of current)
      if (!rows.has(row)) {
        rows.add(row);
        observer?.observe(row);
      }
  };
  watch(
    list,
    (root) => {
      disconnect();
      if (!root) return;
      const owned = generation;
      observer = new IntersectionObserver(
        (entries) => {
          if (owned !== generation) return;
          const next = new Set(visible.value);
          for (const entry of entries) {
            const id = (entry.target as HTMLElement).dataset.layerId;
            if (id) {
              if (entry.isIntersecting) next.add(id);
              else next.delete(id);
            }
          }
          const valid = new Set(order());
          for (const id of next) if (!valid.has(id)) next.delete(id);
          if (next.size !== visible.value.size || [...next].some((id) => !visible.value.has(id))) visible.value = next;
        },
        { root, rootMargin: '192px 0px', threshold: 0 },
      );
      mutation = new MutationObserver(attach);
      mutation.observe(root, { childList: true, subtree: true });
      attach();
    },
    { flush: 'post', immediate: true },
  );
  watch(
    order,
    () => {
      attach();
      const valid = new Set(order());
      visible.value = new Set([...visible.value].filter((id) => valid.has(id)));
    },
    { flush: 'post' },
  );
  onScopeDispose(disconnect);
  return visible;
}
