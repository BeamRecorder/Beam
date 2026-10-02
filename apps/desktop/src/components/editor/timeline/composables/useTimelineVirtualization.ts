import { computed, inject, onMounted, onScopeDispose, provide, ref, type InjectionKey } from 'vue';
import type { Clip } from '@beam/engine/shared/composition-types';
import type { ZoomElement } from '@beam/engine/zoom/zoom-types';
import type { TimelineVirtualizationOptions, TimelineVirtualWindow } from './timeline-virtualization-types';
import { layoutTimelineRows, visibleTimelineRows } from './timeline-virtual-layout';
import { createTimelineRangeIndex } from './timeline-range-index';

const key: InjectionKey<TimelineVirtualWindow> = Symbol('timeline-virtual-window');
export const useTimelineVirtualWindow = () => inject(key, null);

export function useTimelineVirtualization(options: TimelineVirtualizationOptions): TimelineVirtualWindow {
  const viewport = options.viewport;
  const pinnedRow = ref<string | null>(null);
  const pinnedItem = ref<string | null>(null);
  const focusedRow = ref<string | null>(null);
  const focusedItem = ref<string | null>(null);
  const retainFocus = (event: FocusEvent) => {
    const target = event.type === 'focusout' ? event.relatedTarget : event.target;
    const row = target instanceof Element ? target.closest<HTMLElement>('[data-timeline-row-id]') : null;
    focusedRow.value = row && scrollElement?.contains(row) ? (row.dataset.timelineRowId ?? null) : null;
    const item =
      target instanceof Element
        ? target.closest<HTMLElement>('[data-timeline-clip-id], [data-timeline-zoom-id]')
        : null;
    focusedItem.value = focusedRow.value
      ? (item?.dataset.timelineClipId ?? item?.dataset.timelineZoomId ?? null)
      : null;
  };
  let scrollElement: HTMLDivElement | null = null;
  onMounted(() => {
    scrollElement = options.scroll.value;
    scrollElement?.addEventListener('focusin', retainFocus);
    scrollElement?.addEventListener('focusout', retainFocus);
  });
  const releaseInteraction = () => {
    pinnedRow.value = null;
    pinnedItem.value = null;
  };
  onMounted(() => {
    window.addEventListener('pointerup', releaseInteraction);
    window.addEventListener('pointercancel', releaseInteraction);
    window.addEventListener('blur', releaseInteraction);
  });
  onScopeDispose(() => {
    scrollElement?.removeEventListener('focusin', retainFocus);
    scrollElement?.removeEventListener('focusout', retainFocus);
    window.removeEventListener('pointerup', releaseInteraction);
    window.removeEventListener('pointercancel', releaseInteraction);
    window.removeEventListener('blur', releaseInteraction);
  });
  const layout = computed(() => layoutTimelineRows(options.rows(), viewport.height));
  const byId = computed(() => new Map(layout.value.map((row) => [row.id, row])));
  const rows = computed(() =>
    visibleTimelineRows(layout.value, viewport.top, viewport.height, pinnedRow.value ?? focusedRow.value),
  );
  const visibleIds = computed(() => new Set(rows.value.map((row) => row.id)));
  const stackStyle = computed(() => ({
    position: 'relative' as const,
    flex: 'none',
    height: `${layout.value.at(-1) ? layout.value.at(-1)!.top + layout.value.at(-1)!.height : 0}px`,
  }));
  const rowStyle: TimelineVirtualWindow['rowStyle'] = (id) => {
    const row = byId.value.get(id);
    return row
      ? {
          position: 'absolute',
          top: `${row.top}px`,
          left: '0',
          right: '0',
          height: `${row.height}px`,
          minHeight: `${row.height}px`,
          maxHeight: `${row.height}px`,
          flex: 'none',
        }
      : undefined;
  };
  const range = computed(() => {
    const width = options.width.value;
    // Do not mount an entire long lane before its first layout measurement.
    if (width <= 0 || viewport.width <= 0) return { start: -1, end: -1 };
    const msPerPixel = options.durationMs.value / width;
    return {
      start: (viewport.left - 80 - 96) * msPerPixel,
      end: (viewport.left + viewport.width - 80 + 96) * msPerPixel,
    };
  });
  // Weak keys allow departed compositions to be collected rather than retaining every edit.
  const clipIndexes = new WeakMap<readonly Clip[], ReturnType<typeof createTimelineRangeIndex<Clip>>>();
  const zoomIndexes = new WeakMap<readonly ZoomElement[], ReturnType<typeof createTimelineRangeIndex<ZoomElement>>>();
  const visibleClips = <T extends Clip>(clips: readonly T[]): T[] => {
    let index = clipIndexes.get(clips);
    if (!index) {
      index = createTimelineRangeIndex(clips, (clip) => ({
        start: clip.timelineStartMs,
        end: clip.timelineStartMs + clip.timelineDurationMs,
      }));
      clipIndexes.set(clips, index);
    }
    const result = index(range.value.start, range.value.end);
    const retainedId = pinnedItem.value ?? focusedItem.value;
    const pinned = retainedId ? clips.find((clip) => clip.id === retainedId) : undefined;
    if (pinned && !result.includes(pinned)) result.push(pinned);
    return result as T[];
  };
  const visibleZooms = (zooms: readonly ZoomElement[]) => {
    let index = zoomIndexes.get(zooms);
    if (!index) {
      index = createTimelineRangeIndex(zooms, (zoom) => ({
        start: zoom.startMs,
        end: zoom.endMs,
      }));
      zoomIndexes.set(zooms, index);
    }
    const result = index(range.value.start, range.value.end);
    const retainedId = pinnedItem.value ?? focusedItem.value;
    const pinned = retainedId ? zooms.find((zoom) => zoom.id === retainedId) : undefined;
    if (pinned && !result.includes(pinned)) result.push(pinned);
    return result;
  };
  const selectionTargets: TimelineVirtualWindow['selectionTargets'] = () =>
    layout.value.flatMap((row) => {
      const geometry = (start: number, duration: number) => ({
        x: 80 + (start / options.durationMs.value) * options.width.value,
        y: row.top + (row.kind === 'effect' ? 6 : 2),
        width: Math.max(row.kind === 'effect' ? 0 : 14, (duration / options.durationMs.value) * options.width.value),
        height: row.kind === 'effect' ? 36 : row.height - 5,
      });
      return [
        ...row.clips.map((clip) => ({
          id: clip.id,
          kind: 'clip' as const,
          ...geometry(clip.timelineStartMs, clip.timelineDurationMs),
        })),
        ...(row.zooms ?? []).map((zoom) => ({
          id: zoom.id,
          kind: 'zoom' as const,
          ...geometry(zoom.startMs, zoom.endMs - zoom.startMs),
        })),
      ];
    });
  const captureInteraction = (event: PointerEvent) => {
    if (event.button !== 0 || !(event.target instanceof Element)) return;
    const row = event.target.closest<HTMLElement>('[data-timeline-row-id]');
    pinnedRow.value = row?.dataset.timelineRowId ?? null;
    const item = event.target.closest<HTMLElement>('[data-timeline-clip-id], [data-timeline-zoom-id]');
    pinnedItem.value = item?.dataset.timelineClipId ?? item?.dataset.timelineZoomId ?? null;
  };
  const virtualWindow: TimelineVirtualWindow = {
    rows,
    visibleIds,
    stackStyle,
    timeRange: range,
    rowStyle,
    visibleClips,
    visibleZooms,
    selectionTargets,
    captureInteraction,
  };
  provide(key, virtualWindow);
  return virtualWindow;
}

/** Keep full lane contents for selection/context menus, but create VNodes only for mounted lanes. */
export function useVirtualTimelineItems<T>(items: () => readonly T[], id: (item: T) => string) {
  const window = useTimelineVirtualWindow();
  const index = computed(() => new Map(items().map((item) => [id(item), item])));
  return computed(() =>
    window
      ? window.rows.value.flatMap((row) => {
          const item = index.value.get(row.id);
          return item ? [item] : [];
        })
      : [...items()],
  );
}
