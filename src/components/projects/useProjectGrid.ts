import { computed, ref, watch, type Ref } from 'vue';
import { useElementSize, useVirtualList } from '@vueuse/core';
import type { CaptureProject } from '~/api/types/capture-api';
import { projectGridLayout } from './project-grid-layout';

export function useProjectGrid(projects: Ref<CaptureProject[]>, compact: () => boolean) {
  const gridRef = ref<HTMLElement | null>(null);
  const { width } = useElementSize(gridRef);
  const layout = computed(() => projectGridLayout(width.value, compact()));
  const rows = computed(() => {
    const result: CaptureProject[][] = [];
    const columns = layout.value.columns;
    for (let index = 0; index < projects.value.length; index += columns) {
      result.push(projects.value.slice(index, index + columns));
    }
    return result;
  });
  const virtual = useVirtualList(rows, { itemHeight: () => layout.value.rowHeight, overscan: 2 });
  // Read once when the list replaces its loading state; hidden native windows may
  // not deliver ResizeObserver until presentation. Subsequent resizes use the observer.
  watch(
    gridRef,
    (element) => {
      width.value = element?.clientWidth ?? 0;
    },
    { flush: 'post' },
  );
  watch(layout, (next, previous) => {
    const container = virtual.containerProps.ref.value;
    if (!container) return;
    const projectIndex = Math.floor(container.scrollTop / previous.rowHeight) * previous.columns;
    const top = Math.floor(projectIndex / next.columns) * next.rowHeight;
    const maximum = Math.max(0, rows.value.length * next.rowHeight - container.clientHeight);
    container.scrollTop = Math.min(top, maximum);
    virtual.containerProps.onScroll();
  });
  const gridStyle = computed(() => ({
    '--project-columns': layout.value.columns,
    '--project-card-size': `${layout.value.cardSize}px`,
  }));
  return { ...virtual, gridRef, gridStyle };
}
