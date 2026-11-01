import { onBeforeUnmount, onMounted, ref, watch } from 'vue';
import type { Ref } from 'vue';
import type { ScreenshotDockTool, ScreenshotDockToolId } from './screenshot-dock-types';

export function useScreenshotDockDrag(
  row: Ref<HTMLElement | null>,
  tools: () => readonly ScreenshotDockTool[],
  disabled: () => boolean,
  reorder: (id: ScreenshotDockToolId, boundary: number) => void,
) {
  const dragged = ref<ScreenshotDockToolId | null>(null),
    boundary = ref<number | null>(null);
  let frame = 0,
    pointer = 0;
  const leave = () => {
    cancelAnimationFrame(frame);
    frame = 0;
    boundary.value = null;
  };
  const cancel = () => {
    leave();
    dragged.value = null;
  };
  const locate = () => {
    const entries = [...(row.value?.querySelectorAll<HTMLElement>('[data-dock-tool]') ?? [])];
    const index = entries.findIndex((entry) => {
      const rect = entry.getBoundingClientRect();
      return pointer < rect.left + rect.width / 2;
    });
    boundary.value = index < 0 ? entries.length : index;
  };
  const scroll = () => {
    frame = 0;
    const viewport = row.value?.closest<HTMLElement>('.scroll-shadow-viewport');
    if (!viewport || !dragged.value) return;
    const rect = viewport.getBoundingClientRect();
    const amount = pointer < rect.left + 24 ? -4 : pointer > rect.right - 24 ? 4 : 0;
    const previous = viewport.scrollLeft;
    viewport.scrollLeft = Math.max(0, Math.min(viewport.scrollWidth - viewport.clientWidth, previous + amount));
    locate();
    if (viewport.scrollLeft !== previous) frame = requestAnimationFrame(scroll);
  };
  const start = (event: DragEvent, id: ScreenshotDockToolId) => {
    if (disabled()) {
      event.preventDefault();
      return;
    }
    cancel();
    dragged.value = id;
    if (event.dataTransfer) {
      event.dataTransfer.effectAllowed = 'move';
      event.dataTransfer.setData('application/x-beam-dock-tool', id);
    }
  };
  const over = (event: DragEvent) => {
    if (!dragged.value || disabled()) return;
    event.preventDefault();
    if (event.dataTransfer) event.dataTransfer.dropEffect = 'move';
    pointer = event.clientX;
    locate();
    if (!frame) frame = requestAnimationFrame(scroll);
  };
  const drop = (event: DragEvent) => {
    if (dragged.value && !disabled()) {
      over(event);
      reorder(dragged.value, boundary.value!);
    }
    cancel();
  };
  const outside = (event: DragEvent) => {
    if (!(event.relatedTarget instanceof Node) || !row.value?.contains(event.relatedTarget)) leave();
  };
  const marker = (index: number) => {
    const from = tools().findIndex((tool) => tool.id === dragged.value);
    return boundary.value === index && index !== from && index !== from + 1;
  };
  watch(
    [
      disabled,
      () =>
        tools()
          .map((tool) => tool.id)
          .join(','),
    ],
    cancel,
  );
  onMounted(() => window.addEventListener('blur', cancel));
  onBeforeUnmount(() => {
    cancel();
    window.removeEventListener('blur', cancel);
  });
  return { dragged, start, over, drop, outside, marker, cancel };
}
