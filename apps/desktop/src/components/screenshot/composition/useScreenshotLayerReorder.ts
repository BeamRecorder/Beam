import { computed, onScopeDispose, ref, type Ref } from 'vue';
import { reorderLayer } from '@beam/engine/shared/layer-compositing';
import type { ScreenshotLayerGroupDrop, ScreenshotLayerDropTarget } from './screenshot-layer-reorder-types';
import { screenshotLayerDropTarget } from './screenshot-layer-drop-target';

export function useScreenshotLayerReorder(
  list: Ref<HTMLElement | null>,
  ids: () => string[],
  commit: (id: string, index: number) => void,
  groupDrop?: ScreenshotLayerGroupDrop,
) {
  const preview = ref<string[] | null>(null);
  const dragging = ref<string | null>(null);
  const dropTarget = ref<ScreenshotLayerDropTarget | null>(null);
  const dropGroupId = computed(() => (dropTarget.value?.header ? dropTarget.value.groupId : null));
  let disposeGesture: (() => void) | null = null;
  let suppressedClickId: string | null = null;
  let suppressedClickTimer: ReturnType<typeof setTimeout> | null = null;
  const suppressNextClick = (id: string) => {
    suppressedClickId = id;
    if (suppressedClickTimer) clearTimeout(suppressedClickTimer);
    suppressedClickTimer = setTimeout(() => {
      suppressedClickId = null;
      suppressedClickTimer = null;
    }, 0);
  };
  const consumeClick = (event: MouseEvent, id: string) => {
    if (suppressedClickId !== id) return false;
    event.preventDefault();
    event.stopPropagation();
    suppressedClickId = null;
    if (suppressedClickTimer) clearTimeout(suppressedClickTimer);
    suppressedClickTimer = null;
    return true;
  };
  const begin = (event: PointerEvent, id: string) => {
    if (event.button !== 0 || disposeGesture || !list.value || !ids().includes(id)) return;
    const initial = ids();
    const pointerId = event.pointerId;
    const startY = event.clientY;
    const startX = event.clientX;
    let x = event.clientX,
      y = startY,
      frame = 0,
      active = false;
    // Capture on the stable list, not a row that Vue moves during its FLIP transition.
    const target = list.value;
    const apply = () => {
      const node = list.value;
      if (!node || !active) return;
      const bounds = node.getBoundingClientRect();
      const edge = 28;
      if (y < bounds.top + edge) node.scrollTop -= Math.min(10, (bounds.top + edge - y) / 3);
      else if (y > bounds.bottom - edge) node.scrollTop += Math.min(10, (y - bounds.bottom + edge) / 3);
      if (groupDrop) {
        const hit = screenshotLayerDropTarget(node, initial, id, x, y);
        dropTarget.value = hit && groupDrop.canDrop(id, hit.groupId) ? hit : null;
        return;
      }
      const rows = [...node.querySelectorAll<HTMLElement>('[data-layer-id]')].filter(
        (row) => row.getBoundingClientRect().height > 0,
      );
      if (!rows.length) return;
      const row = rows.find((row) => y < row.getBoundingClientRect().bottom) ?? rows.at(-1)!;
      const to = (preview.value ?? initial).indexOf(row.dataset.layerId!);
      if (to < 0) return;
      const order = preview.value ?? initial;
      if (order.indexOf(id) !== to)
        preview.value = reorderLayer(
          order.map((id) => ({ id })),
          id,
          to,
        ).map((layer) => layer.id);
    };
    const tick = () => {
      apply();
      frame = requestAnimationFrame(tick);
    };
    const move = (next: PointerEvent) => {
      if (next.pointerId !== pointerId) return;
      y = next.clientY;
      x = next.clientX;
      if (!active && Math.hypot(x - startX, y - startY) >= 4) {
        active = true;
        next.preventDefault();
        target.setPointerCapture(pointerId);
        dragging.value = id;
        preview.value = initial;
        frame = requestAnimationFrame(tick);
      } else if (active) next.preventDefault();
    };
    const cleanup = () => {
      cancelAnimationFrame(frame);
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', end);
      window.removeEventListener('pointercancel', cancel);
      window.removeEventListener('keydown', keydown);
      window.removeEventListener('blur', cleanup);
      target.removeEventListener('lostpointercapture', cancel);
      if (target.hasPointerCapture(pointerId)) target.releasePointerCapture(pointerId);
      preview.value = null;
      dragging.value = null;
      dropTarget.value = null;
      disposeGesture = null;
    };
    const end = (next: PointerEvent) => {
      if (next.pointerId !== pointerId) return;
      y = next.clientY;
      x = next.clientX;
      apply();
      const index = preview.value?.indexOf(id) ?? initial.indexOf(id);
      try {
        if (active && groupDrop && dropTarget.value) {
          const drop = dropTarget.value;
          const sourceGroup =
            [...target.querySelectorAll<HTMLElement>('[data-layer-id]')]
              .find((row) => row.dataset.layerId === id)
              ?.closest<HTMLElement>('[data-composition-group]')?.dataset.compositionGroup ?? null;
          if (drop.frontIndex !== initial.indexOf(id) || drop.groupId !== sourceGroup)
            groupDrop.commit(id, drop.groupId, drop.frontIndex);
        } else if (active && !groupDrop && index !== initial.indexOf(id)) commit(id, index);
      } finally {
        if (active) suppressNextClick(id);
        cleanup();
      }
    };
    const cancel = (next: PointerEvent) => {
      if (next.pointerId === pointerId) cleanup();
    };
    const keydown = (next: KeyboardEvent) => {
      if (next.key === 'Escape') {
        next.preventDefault();
        next.stopPropagation();
        cleanup();
      }
    };
    disposeGesture = cleanup;
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', end);
    window.addEventListener('pointercancel', cancel);
    window.addEventListener('keydown', keydown);
    window.addEventListener('blur', cleanup);
    target.addEventListener('lostpointercapture', cancel);
  };
  onScopeDispose(() => {
    disposeGesture?.();
    if (suppressedClickTimer) clearTimeout(suppressedClickTimer);
  });
  return { preview, dragging, dropGroupId, dropTarget, begin, consumeClick };
}
